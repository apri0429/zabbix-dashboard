#!/usr/bin/env python3
"""
Zabbix Report Backend API - Multi Router History Version
"""

import os
import math
import smtplib
import traceback
import datetime
import statistics
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from fpdf import FPDF, XPos, YPos
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

try:
    from .mikrotik import get_dhcp_active, get_queue_tree
except ImportError:
    from mikrotik import get_dhcp_active, get_queue_tree


ZABBIX_URL = os.getenv("ZABBIX_URL", "http://192.168.1.233/zabbix")
API_TOKEN = os.getenv("ZABBIX_API_TOKEN", "03e6a831215d4182f1990fb102cd78e78bc73df7c1e4cd61df287346af9ed382")

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "apri@piagam.id")
SMTP_PASS = os.getenv("SMTP_PASS", "efqnhrrptarpnwhf")
TO_EMAIL = [email.strip() for email in os.getenv("TO_EMAIL", "it@piagam.id").split(",") if email.strip()]

BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", r"C:\Zabbix")
REPORT_PATH = os.path.join(BASE_OUTPUT_DIR, "Zabbix_Report.pdf")
CHART_PATH = os.path.join(BASE_OUTPUT_DIR, "chart.png")
PIE_PATH = os.path.join(BASE_OUTPUT_DIR, "pie.png")

os.makedirs(BASE_OUTPUT_DIR, exist_ok=True)

ENABLE_CAPACITY_OUTLIER_FILTER = True
CAPACITY_SPIKE_MULTIPLIER = 1.20
MIN_SAMPLES_FOR_PERCENTILE = 5

ITEM_MAP = {
    "Mikrotik Duta Garden - BIZNET": {
        "host": "Mikrotik Duta Garden",
        "recv": [
            "Interface ether1-BIZNET(BIZNET): Bits received"
        ],
        "sent": [
            "Interface ether1-BIZNET(BIZNET): Bits sent"
        ]
    },
    "Mikrotik Duta Garden - INDIHOME": {
        "host": "Mikrotik Duta Garden",
        "recv": [
            "Interface ether2-ISP2(INDIBIZ): Bits received"
        ],
        "sent": [
            "Interface ether2-ISP2(INDIBIZ): Bits sent"
        ]
    },
    "Mikrotik Rawa Bokor - BIZNET": {
        "host": "Mikrotik Rawa Bokor",
        "recv": [
            "Interface ether1-INTERNET(): Bits received"
        ],
        "sent": [
            "Interface ether1-INTERNET(): Bits sent"
        ]
    },
    "Mikrotik Jatake - BIZNET": {
        "host": "Mikrotik Jatake",
        "recv": [
            "Interface pppoe-out1(PPPOE BIZNET): Bits received"
        ],
        "sent": [
            "Interface pppoe-out1(PPPOE BIZNET): Bits sent"
        ]
    },
    "Mikrotik Jatake - INDIHOME": {
        "host": "Mikrotik Jatake",
        "recv": [
            "Interface ether2-ISP2(ISP INDIBIZ): Bits received"
        ],
        "sent": [
            "Interface ether2-ISP2(ISP INDIBIZ): Bits sent"
        ]
    },
    "Mikrotik Ks Tubun - INDIHOME": {
        "host": "Mikrotik Ks Tubun",
        "recv": [
            "Interface ether1(Internet): Bits received",
            "Interface ether1(Internet ): Bits received"
        ],
        "sent": [
            "Interface ether1(Internet): Bits sent",
            "Interface ether1(Internet ): Bits sent"
        ]
    },
    "Mikrotik Garuda 21 - INDIHOME": {
        "host": "Mikrotik Garuda 21",
        "recv": [
            "Interface Indibiz(Internet): Bits received",
            "Interface Indibiz(Internet ): Bits received"
        ],
        "sent": [
            "Interface Indibiz(Internet): Bits sent",
            "Interface Indibiz(Internet ): Bits sent"
        ]
    }
}

CAPACITY = {
    "Mikrotik Duta Garden - BIZNET": 100,
    "Mikrotik Duta Garden - INDIHOME": 150,
    "Mikrotik Rawa Bokor - BIZNET": 100,
    "Mikrotik Jatake - BIZNET": 150,
    "Mikrotik Jatake - INDIHOME": 100,
    "Mikrotik Ks Tubun - INDIHOME": 100,
    "Mikrotik Garuda 21 - INDIHOME": 50
}

ID_TO_IND_DAY = {
    0: "Senin", 1: "Selasa", 2: "Rabu", 3: "Kamis",
    4: "Jumat", 5: "Sabtu", 6: "Minggu"
}

ID_TO_IND_MONTH = {
    1: "Januari", 2: "Februari", 3: "Maret", 4: "April",
    5: "Mei", 6: "Juni", 7: "Juli", 8: "Agustus",
    9: "September", 10: "Oktober", 11: "November", 12: "Desember"
}

app = FastAPI(title="Zabbix Report Backend", version="6.0.0-multi-history")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOSTID_CACHE: Dict[str, str] = {}
ITEMID_CACHE: Dict[Tuple[str, str], str] = {}
ITEM_VALUE_TYPE_CACHE: Dict[str, int] = {}
ITEM_HISTORY_CACHE: Dict[Tuple[str, int, int], Tuple[datetime.datetime, List[Dict]]] = {}
SUMMARY_CACHE: Dict[Tuple[str, str], Tuple[datetime.datetime, List[Dict]]] = {}
HISTORY_CHART_CACHE: Dict[Tuple[str, str], Tuple[datetime.datetime, List[Dict]]] = {}

CACHE_TTL_SECONDS = 300
MAX_HISTORY_POINTS_PER_HOST = 360


class IgnoreSocketIOAccessLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return "/socket.io/" not in message


def _install_access_log_filter():
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(existing, IgnoreSocketIOAccessLog) for existing in access_logger.filters):
        access_logger.addFilter(IgnoreSocketIOAccessLog())


_install_access_log_filter()


def format_date_ind(dt: datetime.date) -> str:
    day_name = ID_TO_IND_DAY[dt.weekday()]
    month_name = ID_TO_IND_MONTH[dt.month]
    return f"{day_name}, {dt.day:02d} {month_name} {dt.year}"


def parse_datetime(datetime_str: str) -> datetime.datetime:
    try:
        return datetime.datetime.strptime(datetime_str, "%Y-%m-%dT%H:%M")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Format datetime salah: {datetime_str}. Gunakan YYYY-MM-DDTHH:MM"
        )


def datetime_range_to_timestamps(start_dt: datetime.datetime, end_dt: datetime.datetime) -> Tuple[int, int]:
    return int(start_dt.timestamp()), int(end_dt.timestamp())


def ensure_output_dir():
    os.makedirs(BASE_OUTPUT_DIR, exist_ok=True)


def get_cache_value(cache: Dict, key):
    cached = cache.get(key)
    if not cached:
        return None

    expires_at, value = cached
    if expires_at <= datetime.datetime.now():
        cache.pop(key, None)
        return None

    return value


def set_cache_value(cache: Dict, key, value, ttl_seconds: int = CACHE_TTL_SECONDS):
    cache[key] = (
        datetime.datetime.now() + datetime.timedelta(seconds=ttl_seconds),
        value
    )
    return value


def normalize_text(value: str) -> str:
    return " ".join((value or "").strip().split())


def percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0

    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])

    k = (len(ordered) - 1) * (pct / 100.0)
    f = math.floor(k)
    c = math.ceil(k)

    if f == c:
        return float(ordered[int(k)])

    d0 = ordered[f] * (c - k)
    d1 = ordered[c] * (k - f)
    return float(d0 + d1)


def sanitize_bandwidth_samples(values_mbps: List[float], capacity_mbps: float) -> List[float]:
    cleaned: List[float] = []

    threshold = None
    if ENABLE_CAPACITY_OUTLIER_FILTER and capacity_mbps > 0:
        threshold = capacity_mbps * CAPACITY_SPIKE_MULTIPLIER

    for v in values_mbps:
        if v is None:
            continue
        if math.isnan(v):
            continue
        if v < 0:
            continue
        if threshold is not None and v > threshold:
            continue
        cleaned.append(v)

    return cleaned


def sanitize_single_bandwidth_value(value_mbps: float, capacity_mbps: float) -> float:
    if value_mbps is None:
        return 0.0
    if math.isnan(value_mbps):
        return 0.0
    if value_mbps < 0:
        return 0.0

    if ENABLE_CAPACITY_OUTLIER_FILTER and capacity_mbps > 0:
        threshold = capacity_mbps * CAPACITY_SPIKE_MULTIPLIER
        if value_mbps > threshold:
            return 0.0

    return round(value_mbps, 2)


def zabbix_request(method: str, params: Optional[Dict] = None):
    if params is None:
        params = {}

    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json-rpc"
    }

    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    }

    try:
        r = requests.post(
            f"{ZABBIX_URL}/api_jsonrpc.php",
            json=payload,
            headers=headers,
            timeout=60
        )
        r.raise_for_status()
        response = r.json()

        if "error" in response:
            print(f"⚠ Zabbix API Error ({method}): {response['error']}")
            return []

        return response.get("result", [])
    except requests.exceptions.RequestException as e:
        print(f"✗ Request error ({method}): {e}")
        return []


def find_hostid(host_name: str) -> Optional[str]:
    cached = HOSTID_CACHE.get(host_name)
    if cached:
        return cached

    hosts = zabbix_request("host.get", {
        "output": ["hostid", "host", "name"],
        "filter": {"host": [host_name]}
    })

    if not hosts:
        hosts = zabbix_request("host.get", {
            "output": ["hostid", "host", "name"],
            "search": {"name": host_name}
        })

    if not hosts:
        print(f"⚠ Host tidak ditemukan: {host_name}")
        return None

    for h in hosts:
        if normalize_text(h.get("host", "")) == normalize_text(host_name):
            HOSTID_CACHE[host_name] = h["hostid"]
            return h["hostid"]

    for h in hosts:
        if normalize_text(h.get("name", "")) == normalize_text(host_name):
            HOSTID_CACHE[host_name] = h["hostid"]
            return h["hostid"]

    HOSTID_CACHE[host_name] = hosts[0]["hostid"]
    return hosts[0]["hostid"]


def list_hosts(search: str = "") -> List[Dict]:
    params = {
        "output": ["hostid", "host", "name"],
        "sortfield": "host",
        "sortorder": "ASC",
        "limit": 500
    }
    if search:
        params["search"] = {"host": search}
    return zabbix_request("host.get", params)


def list_items_by_host(host_name: str, search: str = "") -> List[Dict]:
    hostid = find_hostid(host_name)
    if not hostid:
        return []

    params = {
        "output": ["itemid", "name", "key_", "value_type"],
        "hostids": [hostid],
        "sortfield": "name",
        "sortorder": "ASC",
        "limit": 1000
    }

    if search:
        params["search"] = {"name": search}

    return zabbix_request("item.get", params)


def find_itemid_exact(host_name: str, item_name: str) -> Optional[str]:
    cache_key = (host_name, item_name)
    cached = ITEMID_CACHE.get(cache_key)
    if cached:
        return cached

    hostid = find_hostid(host_name)
    if not hostid:
        return None

    norm_target = normalize_text(item_name)

    items = zabbix_request("item.get", {
        "output": ["itemid", "name", "key_", "hostid"],
        "hostids": [hostid],
        "search": {"name": item_name},
        "sortfield": "name",
        "sortorder": "ASC",
        "limit": 100
    })

    if not items:
        return None

    for item in items:
        if normalize_text(item.get("name", "")) == norm_target:
            ITEMID_CACHE[cache_key] = item["itemid"]
            return item["itemid"]

    for item in items:
        if norm_target in normalize_text(item.get("name", "")):
            ITEMID_CACHE[cache_key] = item["itemid"]
            return item["itemid"]

    return None


def find_first_valid_itemid(host_name: str, item_names: List[str]) -> Tuple[Optional[str], Optional[str]]:
    for item_name in item_names:
        itemid = find_itemid_exact(host_name, item_name)
        if itemid:
            return itemid, item_name
    return None, None


def get_item_value_type(itemid: str) -> int:
    cached = ITEM_VALUE_TYPE_CACHE.get(itemid)
    if cached is not None:
        return cached

    meta = zabbix_request("item.get", {
        "itemids": [itemid],
        "output": ["value_type"]
    })
    value_type = int(meta[0].get("value_type", 0)) if meta else 0
    ITEM_VALUE_TYPE_CACHE[itemid] = value_type
    return value_type


def get_item_history(itemid: str, start_ts: int, end_ts: int) -> List[Dict]:
    cache_key = (itemid, start_ts, end_ts)
    cached = get_cache_value(ITEM_HISTORY_CACHE, cache_key)
    if cached is not None:
        return cached

    vtype = get_item_value_type(itemid)

    hist = zabbix_request("history.get", {
        "output": ["clock", "value"],
        "history": vtype,
        "itemids": [itemid],
        "time_from": start_ts,
        "time_till": end_ts,
        "sortfield": "clock",
        "sortorder": "ASC",
        "limit": 20000
    })

    return set_cache_value(ITEM_HISTORY_CACHE, cache_key, hist or [])


def get_history_bucket_seconds(start_dt: datetime.datetime, end_dt: datetime.datetime) -> int:
    total_seconds = max(int((end_dt - start_dt).total_seconds()), 1)

    if total_seconds <= 2 * 24 * 3600:
        return 300
    if total_seconds <= 7 * 24 * 3600:
        return 1800
    if total_seconds <= 31 * 24 * 3600:
        return 3600
    return 6 * 3600


def coerce_bucket_seconds(total_seconds: int, requested_bucket_seconds: int) -> int:
    bucket_seconds = max(requested_bucket_seconds, 1)
    while math.ceil(total_seconds / bucket_seconds) > MAX_HISTORY_POINTS_PER_HOST:
        bucket_seconds *= 2
    return bucket_seconds


def calculate_bandwidth_stats(values_mbps: List[float], capacity_mbps: float) -> Dict[str, float]:
    raw_count = len(values_mbps)
    cleaned = sanitize_bandwidth_samples(values_mbps, capacity_mbps)
    used_count = len(cleaned)

    if not cleaned:
        return {
            "avg": 0.0,
            "p95": 0.0,
            "max_raw": round(max(values_mbps), 2) if values_mbps else 0.0,
            "sample_count_raw": raw_count,
            "sample_count_used": 0
        }

    avg_val = round(statistics.mean(cleaned), 2)

    if used_count >= MIN_SAMPLES_FOR_PERCENTILE:
        p95_val = round(percentile(cleaned, 95), 2)
    else:
        p95_val = round(max(cleaned), 2)

    max_raw_val = round(max(values_mbps), 2) if values_mbps else 0.0

    return {
        "avg": avg_val,
        "p95": p95_val,
        "max_raw": max_raw_val,
        "sample_count_raw": raw_count,
        "sample_count_used": used_count
    }


def get_stats_from_itemid(itemid: str, capacity_mbps: float, start_ts: int, end_ts: int) -> Dict[str, float]:
    hist = get_item_history(itemid, start_ts, end_ts)
    values_mbps = [float(h["value"]) / 1_000_000 for h in hist if "value" in h]
    return calculate_bandwidth_stats(values_mbps, capacity_mbps)


def get_stats_from_aliases(
    host_name: str,
    item_names: List[str],
    capacity_mbps: float,
    start_ts: int,
    end_ts: int
) -> Tuple[Dict[str, float], Optional[str], Optional[str]]:
    itemid, matched_name = find_first_valid_itemid(host_name, item_names)
    if not itemid:
        return {
            "avg": 0.0,
            "p95": 0.0,
            "max_raw": 0.0,
            "sample_count_raw": 0,
            "sample_count_used": 0
        }, None, None

    stats = get_stats_from_itemid(itemid, capacity_mbps, start_ts, end_ts)
    return stats, matched_name, itemid


def get_daily_usage_dual(
    host_name: str,
    recv_items: List[str],
    sent_items: List[str],
    start_ts: int,
    end_ts: int,
    capacity_mbps: float
) -> Dict:
    results: Dict[datetime.date, Dict[str, float]] = {}

    recv_itemid, _ = find_first_valid_itemid(host_name, recv_items)
    sent_itemid, _ = find_first_valid_itemid(host_name, sent_items)

    if recv_itemid:
        hist = get_item_history(recv_itemid, start_ts, end_ts)
        daily_data: Dict[datetime.date, List[float]] = {}

        for h in hist:
            dt = datetime.datetime.fromtimestamp(int(h["clock"])).date()
            mbps = float(h["value"]) / 1_000_000
            daily_data.setdefault(dt, []).append(mbps)

        for dt, values in daily_data.items():
            cleaned = sanitize_bandwidth_samples(values, capacity_mbps)
            if not cleaned:
                continue
            results.setdefault(dt, {"download": 0.0, "upload": 0.0, "total": 0.0})
            results[dt]["download"] = round(statistics.mean(cleaned), 2)

    if sent_itemid:
        hist = get_item_history(sent_itemid, start_ts, end_ts)
        daily_data: Dict[datetime.date, List[float]] = {}

        for h in hist:
            dt = datetime.datetime.fromtimestamp(int(h["clock"])).date()
            mbps = float(h["value"]) / 1_000_000
            daily_data.setdefault(dt, []).append(mbps)

        for dt, values in daily_data.items():
            cleaned = sanitize_bandwidth_samples(values, capacity_mbps)
            if not cleaned:
                continue
            results.setdefault(dt, {"download": 0.0, "upload": 0.0, "total": 0.0})
            results[dt]["upload"] = round(statistics.mean(cleaned), 2)

    for dt in results:
        results[dt]["total"] = round(results[dt]["download"] + results[dt]["upload"], 2)

    return results


def build_history_chart_all(start_dt: datetime.datetime, end_dt: datetime.datetime) -> List[Dict]:
    cache_key = (
        start_dt.strftime("%Y-%m-%dT%H:%M"),
        end_dt.strftime("%Y-%m-%dT%H:%M")
    )
    cached = get_cache_value(HISTORY_CHART_CACHE, cache_key)
    if cached is not None:
        return cached

    start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)
    total_seconds = max(end_ts - start_ts, 1)
    bucket_seconds = coerce_bucket_seconds(
        total_seconds,
        get_history_bucket_seconds(start_dt, end_dt)
    )
    all_points: List[Dict] = []

    for label, cfg in ITEM_MAP.items():
        host_name = cfg.get("host", "").strip()
        recv_items = cfg.get("recv", [])
        sent_items = cfg.get("sent", [])
        capacity = CAPACITY.get(label, 0) or 0

        recv_itemid, _ = find_first_valid_itemid(host_name, recv_items)
        sent_itemid, _ = find_first_valid_itemid(host_name, sent_items)

        result_map: Dict[int, Dict[str, float]] = {}

        if recv_itemid:
            recv_hist = get_item_history(recv_itemid, start_ts, end_ts)
            for row in recv_hist:
                clock = int(row["clock"])
                mbps = float(row["value"]) / 1_000_000
                mbps = sanitize_single_bandwidth_value(mbps, capacity)
                bucket_clock = start_ts + (((clock - start_ts) // bucket_seconds) * bucket_seconds)

                result_map.setdefault(bucket_clock, {
                    "time": datetime.datetime.fromtimestamp(bucket_clock).strftime("%Y-%m-%d %H:%M:%S"),
                    "download_sum": 0.0,
                    "download_count": 0,
                    "upload_sum": 0.0,
                    "upload_count": 0,
                    "host": label,
                })
                result_map[bucket_clock]["download_sum"] += mbps
                result_map[bucket_clock]["download_count"] += 1

        if sent_itemid:
            sent_hist = get_item_history(sent_itemid, start_ts, end_ts)
            for row in sent_hist:
                clock = int(row["clock"])
                mbps = float(row["value"]) / 1_000_000
                mbps = sanitize_single_bandwidth_value(mbps, capacity)
                bucket_clock = start_ts + (((clock - start_ts) // bucket_seconds) * bucket_seconds)

                result_map.setdefault(bucket_clock, {
                    "time": datetime.datetime.fromtimestamp(bucket_clock).strftime("%Y-%m-%d %H:%M:%S"),
                    "download_sum": 0.0,
                    "download_count": 0,
                    "upload_sum": 0.0,
                    "upload_count": 0,
                    "host": label,
                })
                result_map[bucket_clock]["upload_sum"] += mbps
                result_map[bucket_clock]["upload_count"] += 1

        sorted_points = []
        for bucket_clock in sorted(result_map.keys()):
            row = result_map[bucket_clock]
            sorted_points.append({
                "time": row["time"],
                "download": round(
                    row["download_sum"] / row["download_count"], 2
                ) if row["download_count"] else 0.0,
                "upload": round(
                    row["upload_sum"] / row["upload_count"], 2
                ) if row["upload_count"] else 0.0,
                "host": row["host"],
            })
        all_points.extend(sorted_points)

    return set_cache_value(HISTORY_CHART_CACHE, cache_key, all_points)


def build_summary(start_dt: datetime.datetime, end_dt: datetime.datetime) -> List[Dict]:
    cache_key = (
        start_dt.strftime("%Y-%m-%dT%H:%M"),
        end_dt.strftime("%Y-%m-%dT%H:%M")
    )
    cached = get_cache_value(SUMMARY_CACHE, cache_key)
    if cached is not None:
        return cached

    rows = []
    start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)

    for label, items in ITEM_MAP.items():
        host_name = items.get("host", "").strip()
        cap = CAPACITY.get(label, 0) or 0

        recv_stats, matched_recv, recv_itemid = get_stats_from_aliases(
            host_name, items.get("recv", []), cap, start_ts, end_ts
        )
        sent_stats, matched_sent, sent_itemid = get_stats_from_aliases(
            host_name, items.get("sent", []), cap, start_ts, end_ts
        )

        avg_download = recv_stats["avg"]
        avg_upload = sent_stats["avg"]

        peak_download = recv_stats["max_raw"]
        peak_upload = sent_stats["max_raw"]

        p95_download = recv_stats["p95"]
        p95_upload = sent_stats["p95"]

        avg_total = round(avg_download + avg_upload, 2)

        pct_avg_download = round((avg_download / cap) * 100, 1) if cap else 0.0
        pct_avg_upload = round((avg_upload / cap) * 100, 1) if cap else 0.0
        pct_p95_download = round((p95_download / cap) * 100, 1) if cap else 0.0
        pct_p95_upload = round((p95_upload / cap) * 100, 1) if cap else 0.0

        max_avg_pct = max(pct_avg_download, pct_avg_upload)
        max_peak_pct = max(pct_p95_download, pct_p95_upload)

        weighted_score = round((0.6 * max_avg_pct) + (0.4 * max_peak_pct), 1)

        if weighted_score > 80:
            status = "TINGGI"
            color = (255, 70, 70)
            solusi = "Perlu monitoring intensif dan evaluasi upgrade kapasitas segera."
        elif weighted_score > 60:
            status = "PADAT"
            color = (255, 190, 80)
            solusi = "Pantau jam sibuk dan pertimbangkan optimasi traffic atau QoS."
        else:
            status = "STABIL"
            color = (90, 200, 90)
            solusi = "Pemakaian normal. Lanjutkan monitoring rutin."

        rows.append({
            "label": label,
            "host": host_name,
            "capacity": cap,
            "avg_download": avg_download,
            "avg_upload": avg_upload,
            "avg": avg_total,
            "peak_download": peak_download,
            "peak_upload": peak_upload,
            "p95_download": p95_download,
            "p95_upload": p95_upload,
            "pct_avg_download": pct_avg_download,
            "pct_avg_upload": pct_avg_upload,
            "max_avg_pct": max_avg_pct,
            "max_peak_pct": max_peak_pct,
            "weighted_score": weighted_score,
            "status": status,
            "color": color,
            "solusi": solusi,
            "recv_item_name": matched_recv,
            "recv_itemid": recv_itemid,
            "sent_item_name": matched_sent,
            "sent_itemid": sent_itemid,
            "recv_sample_raw": recv_stats["sample_count_raw"],
            "recv_sample_used": recv_stats["sample_count_used"],
            "sent_sample_raw": sent_stats["sample_count_raw"],
            "sent_sample_used": sent_stats["sample_count_used"]
        })

    return set_cache_value(SUMMARY_CACHE, cache_key, rows)


def build_global_summary(summary: List[Dict]) -> Dict:
    high_score = max(summary, key=lambda x: x["weighted_score"]) if summary else None
    high_avg = max(summary, key=lambda x: x["avg"]) if summary else None
    high_peak_down = max(summary, key=lambda x: x["peak_download"]) if summary else None
    high_peak_up = max(summary, key=lambda x: x["peak_upload"]) if summary else None

    return {
        "high_score": high_score,
        "high_avg": high_avg,
        "high_peak_down": high_peak_down,
        "high_peak_up": high_peak_up
    }


# ─────────────────────────────────────────────
#  PDF CLASS  —  Modern Professional Design
# ─────────────────────────────────────────────

# Colour palette
_C_NAVY    = (15,  32,  68)   # deep navy – primary brand
_C_ACCENT  = (0,  114, 206)   # corporate blue – accent line / highlights
_C_GOLD    = (196, 155,  55)  # warm gold – secondary accent
_C_BG      = (245, 247, 250)  # near-white background for alternating rows
_C_BORDER  = (210, 216, 224)  # light grey table border
_C_BODY    = (40,  45,  55)   # near-black body text
_C_MUTED   = (110, 120, 135)  # muted/secondary text
_C_WHITE   = (255, 255, 255)

# Status colour chips  (filled badge style)
_STATUS_COLORS = {
    "TINGGI": (220,  53,  69),   # red
    "PADAT":  (255, 163,  47),   # amber
    "STABIL": ( 32, 178, 100),   # green
}


class PDF(FPDF):
    # ── header ────────────────────────────────
    def header(self):
        # Top accent bar
        self.set_fill_color(*_C_NAVY)
        self.rect(0, 0, 210, 14, "F")

        # Company name – white on navy
        self.set_y(2)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*_C_WHITE)
        self.cell(0, 5, "PT PILAR NIAGA MAKMUR", align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(190, 210, 240)
        self.cell(0, 4, "Network Operations  |  Bandwidth Monitoring System", align="L",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Title block – starts below the navy bar
        self.set_y(20)
        self.set_font("Helvetica", "B", 17)
        self.set_text_color(*_C_NAVY)
        self.cell(0, 9, "LAPORAN TRAFIK JARINGAN", align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Accent underline
        self.set_draw_color(*_C_ACCENT)
        self.set_line_width(0.8)
        self.line(10, self.get_y() + 1, 200, self.get_y() + 1)
        self.ln(4)

    # ── footer ────────────────────────────────
    def footer(self):
        self.set_y(-13)
        # Footer rule
        self.set_draw_color(*_C_BORDER)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(1)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*_C_MUTED)
        self.cell(95, 5, "PT Pilar Niaga Makmur  -  Confidential", align="L")
        self.cell(95, 5, f"Halaman {self.page_no()}", align="R")

    # ── helper: section title ─────────────────
    def section_title(self, text: str):
        self.ln(3)
        # Left colour bar
        x, y = self.get_x(), self.get_y()
        self.set_fill_color(*_C_ACCENT)
        self.rect(10, y, 3, 7, "F")
        self.set_x(15)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*_C_NAVY)
        self.cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    # ── helper: info box (light bg) ───────────
    def info_box(self, lines: List[str]):
        box_y = self.get_y()
        box_h = len(lines) * 5 + 8
        self.set_fill_color(*_C_BG)
        self.set_draw_color(*_C_BORDER)
        self.set_line_width(0.3)
        self.rect(10, box_y, 190, box_h, "FD")
        self.set_xy(14, box_y + 4)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*_C_BODY)
        for line in lines:
            self.cell(0, 5, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_x(14)
        self.ln(3)


def make_pdf(summary: List[Dict], start_dt: datetime.datetime, end_dt: datetime.datetime, output_path: str = REPORT_PATH):
    pdf = PDF()
    pdf.add_page()

    # ── Period badge ──────────────────────────
    periode = f"Periode:  {start_dt.strftime('%d-%m-%Y %H:%M')}  -  {end_dt.strftime('%d-%m-%Y %H:%M')}"
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_C_MUTED)
    pdf.cell(0, 6, periode, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ── Methodology info box ──────────────────
    pdf.info_box([
        "Metode Perhitungan Status:",
        "  Peak pada tabel = nilai MAX absolut (konsisten dengan grafik Zabbix).",
        "  Weighted Score  = (60% x Avg tertinggi) + (40% x P95 tertinggi)  - lebih stabil terhadap spike.",
        "  Kategori:  STABIL  0 - 60%    PADAT  60 - 80%    TINGGI  > 80%",
    ])

    # ── Summary table ─────────────────────────
    pdf.section_title("Ringkasan Trafik Jaringan")

    # Total usable width = 190mm. Columns must sum to exactly 190.
    # Host/ISP wider, Cap narrow, numeric cols equal, Status fixed
    COL_W  = [52, 14, 21, 21, 21, 21, 18, 22]   # sum = 190
    HEADS  = ["Host / ISP", "Cap", "Avg Down", "Avg Up", "Peak Down", "Peak Up", "Score", "Status"]
    HEAD_H = 7    # single-line header
    ROW_H  = 8    # data row height — enough padding top/bottom

    # ── Header ──
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_fill_color(*_C_NAVY)
    pdf.set_text_color(*_C_WHITE)
    pdf.set_draw_color(*_C_BORDER)
    pdf.set_line_width(0.2)
    start_x = pdf.get_x()
    start_y = pdf.get_y()
    for i, h in enumerate(HEADS):
        pdf.multi_cell(COL_W[i], HEAD_H, h, border=1, align="C", fill=True,
                       new_x=XPos.RIGHT, new_y=YPos.TOP, max_line_height=HEAD_H)
    pdf.set_xy(start_x, start_y + HEAD_H)

    # ── Data rows ──
    pdf.set_font("Helvetica", "", 7.5)
    for idx, r in enumerate(summary):
        fill_bg = idx % 2 == 0
        pdf.set_fill_color(*(_C_BG if fill_bg else _C_WHITE))
        pdf.set_text_color(*_C_BODY)

        # Helper: right-aligned numeric cell with unit
        def num_cell(w, val, unit=""):
            txt = f"{val} {unit}".strip() if unit else str(val)
            pdf.cell(w, ROW_H, txt, border=1, align="R", fill=fill_bg)

        pdf.cell(COL_W[0], ROW_H, r["label"],                    border=1, align="L", fill=fill_bg)
        num_cell(COL_W[1], r["capacity"],    "Mbps")
        num_cell(COL_W[2], r["avg_download"],"Mbps")
        num_cell(COL_W[3], r["avg_upload"],  "Mbps")
        num_cell(COL_W[4], r["peak_download"],"Mbps")
        num_cell(COL_W[5], r["peak_upload"], "Mbps")
        pdf.cell(COL_W[6], ROW_H, f"{r['weighted_score']}%",    border=1, align="C", fill=fill_bg)

        # Status badge — coloured fill
        sc = _STATUS_COLORS.get(r["status"], (150, 150, 150))
        pdf.set_fill_color(*sc)
        pdf.set_text_color(*_C_WHITE)
        pdf.set_font("Helvetica", "B", 7)
        pdf.cell(COL_W[7], ROW_H, r["status"], border=1, align="C", fill=True)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*_C_BODY)
        pdf.ln()

    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*_C_MUTED)
    pdf.multi_cell(0, 4,
        "Catatan: Kolom Peak menggunakan nilai MAX absolut agar konsisten dengan grafik Zabbix. "
        "Score tetap memakai P95 agar penilaian tidak terlalu sensitif terhadap spike sesaat.")
    pdf.ln(4)

    # ── Global analysis ───────────────────────
    pdf.section_title("Analisa Global")
    global_sum = build_global_summary(summary)
    lines = []
    if global_sum["high_score"]:
        lines.append(f"  Weighted Score tertinggi : {global_sum['high_score']['label']} ({global_sum['high_score']['weighted_score']}%)")
    if global_sum["high_avg"]:
        lines.append(f"  Rata-rata total tertinggi : {global_sum['high_avg']['label']} ({global_sum['high_avg']['avg']} Mbps)")
    if global_sum["high_peak_down"]:
        lines.append(f"  Peak Download tertinggi   : {global_sum['high_peak_down']['label']} ({global_sum['high_peak_down']['peak_download']} Mbps)")
    if global_sum["high_peak_up"]:
        lines.append(f"  Peak Upload tertinggi     : {global_sum['high_peak_up']['label']} ({global_sum['high_peak_up']['peak_upload']} Mbps)")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_C_BODY)
    for line in lines:
        pdf.cell(0, 6, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ── Per-location analysis ─────────────────
    pdf.section_title("Analisa Per Lokasi")
    start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)

    for r in summary:
        label     = r["label"]
        host_name = ITEM_MAP.get(label, {}).get("host", "")
        recv_list = ITEM_MAP.get(label, {}).get("recv", [])
        sent_list = ITEM_MAP.get(label, {}).get("sent", [])
        capacity  = CAPACITY.get(label, 0) or 0

        daily = get_daily_usage_dual(host_name, recv_list, sent_list, start_ts, end_ts, capacity)

        # Location label with status dot
        sc = _STATUS_COLORS.get(r["status"], (150, 150, 150))
        dot_x, dot_y = 10, pdf.get_y() + 2.5
        pdf.set_fill_color(*sc)
        pdf.ellipse(dot_x, dot_y, 3, 3, "F")
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_C_NAVY)
        pdf.cell(0, 7, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*_C_BODY)
        pdf.set_x(15)

        if not daily:
            pdf.cell(0, 5, "Data harian tidak tersedia untuk lokasi ini.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)
            continue

        high_date = max(daily.keys(), key=lambda d: daily[d]["total"])
        low_date  = min(daily.keys(), key=lambda d: daily[d]["total"])

        text = (
            f"Score: {r['weighted_score']}%  |  Status: {r['status']}.  "
            f"Puncak harian rata-rata tertinggi pada {format_date_ind(high_date)} "
            f"dengan total {daily[high_date]['total']} Mbps "
            f"(Download: {daily[high_date]['download']} Mbps, Upload: {daily[high_date]['upload']} Mbps). "
            f"Terendah pada {format_date_ind(low_date)} dengan total {daily[low_date]['total']} Mbps."
        )
        pdf.multi_cell(180, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_x(15)
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(*_C_MUTED)
        pdf.cell(0, 5, f"Rekomendasi: {r['solusi']}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(3)

    # ── Charts ────────────────────────────────
    if os.path.exists(CHART_PATH):
        pdf.add_page()
        pdf.section_title("Grafik Trafik  -  Download vs Upload")
        pdf.image(CHART_PATH, x=10, w=190)

    if os.path.exists(PIE_PATH):
        pdf.add_page()
        pdf.section_title("Distribusi Pemakaian Bandwidth")
        pdf.image(PIE_PATH, x=20, w=170)

    pdf.output(output_path)


# ─────────────────────────────────────────────
#  CHART  —  Modern dark bar chart
# ─────────────────────────────────────────────

def make_chart(summary: List[Dict], output_path: str = CHART_PATH):
    import numpy as np
    from matplotlib.lines import Line2D

    labels_short = [r["label"].replace("Mikrotik ", "").replace(" - ", "\n") for r in summary]
    download_avg = [r["avg_download"] for r in summary]
    upload_avg   = [r["avg_upload"]   for r in summary]
    download_peak= [r["peak_download"]for r in summary]
    upload_peak  = [r["peak_upload"]  for r in summary]
    capacities   = [r["capacity"]     for r in summary]

    n = len(summary)
    x = np.arange(n)
    w = 0.18

    def bar_color(val, cap):
        pct = (val / cap * 100) if cap else 0
        if pct > 80:
            return "#ef4444"
        elif pct > 60:
            return "#f59e0b"
        else:
            return "#3b82f6"

    colors_dl_avg = [bar_color(v, c) for v, c in zip(download_avg, capacities)]

    fig, ax = plt.subplots(figsize=(16, 8))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#f8fafc")

    b1 = ax.bar(x - 1.5*w, download_avg,  w, label="Avg Download",  color=colors_dl_avg, zorder=3, linewidth=0)
    b2 = ax.bar(x - 0.5*w, upload_avg,    w, label="Avg Upload",    color="#6366f1", zorder=3, linewidth=0, alpha=0.85)
    b3 = ax.bar(x + 0.5*w, download_peak, w, label="Peak Download", color="#3b82f6", zorder=3, linewidth=0.6, alpha=0.55, hatch="//", edgecolor="#93c5fd")
    b4 = ax.bar(x + 1.5*w, upload_peak,   w, label="Peak Upload",   color="#8b5cf6", zorder=3, linewidth=0.6, alpha=0.55, hatch="//", edgecolor="#c4b5fd")

    for bars in [b1, b2, b3, b4]:
        for bar in bars:
            h = bar.get_height()
            if h > 0:
                ax.text(bar.get_x() + bar.get_width() / 2, h + 0.4, f"{h:.1f}",
                        ha="center", va="bottom", fontsize=6.5, color="#374151", fontweight="bold")

    for i, cap in enumerate(capacities):
        ax.hlines(cap, i - 2*w, i + 2*w, colors="#ef4444", linewidths=1.2, linestyles="--", zorder=4)
        ax.text(i + 2*w + 0.06, cap, f"{cap}M", va="center", fontsize=7, color="#ef4444")

    ax.grid(axis="y", color="#e2e8f0", linestyle="--", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.set_xticks(x)
    ax.set_xticklabels(labels_short, color="#1e293b", fontsize=8.5, fontweight="bold")
    ax.set_ylabel("Bandwidth (Mbps)", color="#475569", fontsize=10)
    ax.tick_params(colors="#64748b", which="both")

    cap_line = Line2D([0], [0], color="#ef4444", linewidth=1.2, linestyle="--", label="Kapasitas")
    ax.legend(handles=[b1, b2, b3, b4, cap_line], loc="upper right",
              framealpha=0.9, facecolor="#ffffff", edgecolor="#e2e8f0",
              labelcolor="#374151", fontsize=9)

    fig.suptitle("Perbandingan Trafik Download vs Upload", color="#0f2044",
                 fontsize=14, fontweight="bold", y=0.99)
    ax.set_title("Solid = Average  |  Hatch = Peak  |  Garis merah putus = Kapasitas",
                 color="#64748b", fontsize=8, pad=8)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()


# ─────────────────────────────────────────────
#  PIE  —  Modern donut chart
# ─────────────────────────────────────────────

def make_pie(summary: List[Dict], output_path: str = PIE_PATH):
    labels = [r["label"].replace("Mikrotik ", "") for r in summary]
    vals   = [r["avg"] for r in summary]
    if not any(vals):
        vals = [1] * len(vals)

    total = sum(vals) or 1

    colors = [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
        "#a78bfa", "#fb923c", "#34d399", "#f472b6",
    ]
    colors = [colors[i % len(colors)] for i in range(len(summary))]

    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    wedge_props = dict(width=0.46, edgecolor="#ffffff", linewidth=3)
    wedges, texts, autotexts = ax.pie(
        vals,
        labels=None,
        autopct=lambda pct: f"{pct:.1f}%" if pct > 3 else "",
        pctdistance=0.77,
        colors=colors,
        startangle=90,
        wedgeprops=wedge_props,
        textprops={"color": "#1e293b", "fontsize": 9, "fontweight": "bold"},
    )

    for at in autotexts:
        at.set_color("#1e293b")
        at.set_fontsize(9)
        at.set_fontweight("bold")

    ax.text(0,  0.10, f"{total:.1f}",       ha="center", va="center", fontsize=24, fontweight="bold", color="#0f2044")
    ax.text(0, -0.15, "Mbps Total",         ha="center", va="center", fontsize=10, color="#475569")
    ax.text(0, -0.35, "Rata-rata Bandwidth",ha="center", va="center", fontsize=8,  color="#94a3b8")

    legend_labels = [
        f"{labels[i]}  ({vals[i]:.1f} Mbps  |  {vals[i]/total*100:.1f}%)"
        for i in range(len(summary))
    ]
    ax.legend(wedges, legend_labels, loc="center left", bbox_to_anchor=(0.90, 0.5),
              framealpha=0.9, facecolor="#ffffff", edgecolor="#e2e8f0",
              labelcolor="#374151", fontsize=9,
              handlelength=1.2, handleheight=1.2, borderpad=0.8, labelspacing=0.9)

    ax.set_title("Distribusi Rata-rata Bandwidth per Host / ISP",
                 color="#0f2044", fontsize=13, fontweight="bold", pad=14)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()


def send_email(summary: List[Dict], start_dt: datetime.datetime, end_dt: datetime.datetime, report_path: str = REPORT_PATH):
    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = ", ".join(TO_EMAIL)
    msg["Subject"] = f"Laporan Trafik - PT Pilar Niaga Makmur ({end_dt.strftime('%d/%m/%Y %H:%M')})"

    status_count = build_status_count(summary)
    total_hosts  = len(summary)
    generated_at = end_dt.strftime("%d %B %Y, %H:%M")
    periode_str  = f"{start_dt.strftime('%d %b %Y %H:%M')} - {end_dt.strftime('%d %b %Y %H:%M')}"

    def status_badge(label, count, bg):
        return (
            f'<td style="padding:0 8px;text-align:center;">'
            f'<div style="background:{bg};color:#fff;border-radius:6px;'
            f'padding:8px 16px;font-size:13px;font-weight:600;letter-spacing:0.5px;">'
            f'{count}<br><span style="font-size:10px;font-weight:400;opacity:0.9;">{label}</span>'
            f'</div></td>'
        )

    rows_html = ""
    for r in summary:
        sc_map = {"TINGGI": "#dc3545", "PADAT": "#fd7e14", "STABIL": "#20b264"}
        sc = sc_map.get(r["status"], "#6c757d")
        rows_html += (
            "<tr style='border-bottom:1px solid #f0f0f0;'>"
            f"<td style='padding:9px 12px;font-size:12px;color:#1e293b;'>{r['label']}</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:center;'>{r['capacity']} Mbps</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:right;'>{r['avg_download']} Mbps</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:right;'>{r['avg_upload']} Mbps</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:right;'>{r['peak_download']} Mbps</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:right;'>{r['peak_upload']} Mbps</td>"
            f"<td style='padding:9px 12px;font-size:12px;color:#475569;text-align:center;'>{r['weighted_score']}%</td>"
            f"<td style='padding:9px 12px;text-align:center;'>"
            f"<span style='background:{sc};color:#fff;border-radius:4px;padding:2px 10px;"
            f"font-size:11px;font-weight:600;'>{r['status']}</span>"
            "</td></tr>"
        )

    stabil_c  = status_count.get('STABIL', 0)
    padat_c   = status_count.get('PADAT',  0)
    tinggi_c  = status_count.get('TINGGI', 0)

    html = (
        "<!DOCTYPE html>"
        "<html lang='id'><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'></head>"
        "<body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;'>"
        "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f4f6f9;padding:32px 0;'>"
        "<tr><td align='center'>"
        "<table width='640' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:10px;"
        "overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);'>"
        # Top bar
        "<tr><td style='background:#0f2044;padding:20px 32px;'>"
        "<p style='margin:0;color:#c4d4ef;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;'>"
        "PT Pilar Niaga Makmur</p>"
        "<h1 style='margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;'>"
        "Laporan Trafik Jaringan</h1>"
        "<p style='margin:4px 0 0;color:#8fadd4;font-size:12px;'>Network Bandwidth Monitoring Report</p>"
        "</td></tr>"
        # Period banner
        f"<tr><td style='background:#1a3a6e;padding:10px 32px;'>"
        f"<p style='margin:0;color:#c4d4ef;font-size:12px;'>Periode &nbsp;:&nbsp; "
        f"<strong style='color:#ffffff;'>{periode_str}</strong>"
        f" &nbsp;&nbsp;|&nbsp;&nbsp; Dibuat pada &nbsp;:&nbsp; "
        f"<strong style='color:#ffffff;'>{generated_at}</strong></p></td></tr>"
        # Body
        "<tr><td style='padding:28px 32px;'>"
        # Status cards
        "<p style='margin:0 0 14px;font-size:13px;font-weight:600;color:#0f2044;"
        "letter-spacing:0.3px;text-transform:uppercase;'>Ringkasan Status</p>"
        "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:28px;'><tr>"
        + status_badge("STABIL",  stabil_c,  "#20b264")
        + status_badge("PADAT",   padat_c,   "#fd7e14")
        + status_badge("TINGGI",  tinggi_c,  "#dc3545")
        + f"<td style='padding:0 8px;text-align:center;'>"
          f"<div style='background:#0f2044;color:#fff;border-radius:6px;padding:8px 16px;"
          f"font-size:13px;font-weight:600;'>{total_hosts}<br>"
          f"<span style='font-size:10px;font-weight:400;opacity:0.9;'>Total Host</span></div></td>"
        + "</tr></table>"
        # Data table
        "<p style='margin:0 0 10px;font-size:13px;font-weight:600;color:#0f2044;"
        "letter-spacing:0.3px;text-transform:uppercase;'>Detail Per Host / ISP</p>"
        "<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;"
        "font-size:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;'>"
        "<thead><tr style='background:#0f2044;'>"
        "<th style='padding:10px 12px;color:#fff;text-align:left;font-weight:600;'>Host / ISP</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:center;font-weight:600;'>Kapasitas</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:right;font-weight:600;'>Avg Down</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:right;font-weight:600;'>Avg Up</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:right;font-weight:600;'>Peak Down</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:right;font-weight:600;'>Peak Up</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:center;font-weight:600;'>Score</th>"
        "<th style='padding:10px 12px;color:#fff;text-align:center;font-weight:600;'>Status</th>"
        "</tr></thead>"
        f"<tbody>{rows_html}</tbody></table>"
        # Method note
        "<p style='margin:18px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;'>"
        "<strong style='color:#64748b;'>Catatan Metodologi:</strong> "
        "Kolom Peak menggunakan nilai MAX absolut agar konsisten dengan grafik Zabbix. "
        "Weighted Score dihitung menggunakan P95 agar penilaian status tidak sensitif terhadap spike sesaat. "
        "Formula: Score = (60% x Avg tertinggi) + (40% x P95 tertinggi).</p>"
        # Attachment note
        "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:24px;"
        "background:#f0f7ff;border-left:4px solid #0072ce;border-radius:4px;'><tr>"
        "<td style='padding:14px 18px;'>"
        "<p style='margin:0;font-size:12px;color:#1e3a5f;font-weight:600;'>"
        "Laporan lengkap tersedia dalam lampiran PDF.</p>"
        "<p style='margin:4px 0 0;font-size:11px;color:#475569;'>"
        "File PDF memuat grafik trafik, distribusi bandwidth, dan analisa detail per lokasi.</p>"
        "</td></tr></table>"
        "</td></tr>"
        # Footer
        "<tr><td style='background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;'>"
        "<p style='margin:0;font-size:11px;color:#94a3b8;text-align:center;'>"
        "Email ini dibuat secara otomatis oleh sistem monitoring jaringan PT Pilar Niaga Makmur. "
        "Mohon tidak membalas email ini.</p>"
        "</td></tr>"
        "</table></td></tr></table></body></html>"
    )
    msg.attach(MIMEText(html, "html"))

    try:
        with open(report_path, "rb") as f:
            attach = MIMEApplication(f.read(), _subtype="pdf")
            attach.add_header("Content-Disposition", "attachment", filename=os.path.basename(report_path))
            msg.attach(attach)
    except FileNotFoundError:
        print("⚠ PDF tidak ditemukan")

    s = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    s.starttls()
    s.login(SMTP_USER, SMTP_PASS)
    s.send_message(msg)
    s.quit()


def build_status_count(summary: List[Dict]) -> Dict[str, int]:
    status_count = {"STABIL": 0, "PADAT": 0, "TINGGI": 0}
    for r in summary:
        if r["status"] in status_count:
            status_count[r["status"]] += 1
    return status_count


def build_weighted_breakdown(summary: List[Dict]) -> List[Dict]:
    result = []
    for r in summary:
        avg_component  = round(0.6 * r["max_avg_pct"], 1)
        peak_component = round(0.4 * r["max_peak_pct"], 1)
        result.append({
            "label": r["label"],
            "weighted_score": r["weighted_score"],
            "max_avg_pct": r["max_avg_pct"],
            "max_peak_pct": r["max_peak_pct"],
            "avg_component": avg_component,
            "peak_component": peak_component,
            "status": r["status"]
        })
    return result


@app.get("/")
def root():
    return {
        "message": "Zabbix Report Backend API running",
        "version": "6.0.0-multi-history",
        "endpoints": [
            "/api/report/summary",
            "/api/report/export-pdf",
            "/api/report/send-email",
            "/api/report/chart",
            "/api/report/pie",
            "/api/debug/hosts",
            "/api/debug/items-by-host",
            "/api/mikrotik/dhcp-active",
            "/api/mikrotik/queue-tree"
        ]
    }


@app.get("/api/debug/hosts")
def api_debug_hosts(search: str = ""):
    return {"hosts": list_hosts(search)}


@app.get("/api/debug/items-by-host")
def api_debug_items_by_host(host: str, search: str = ""):
    items = list_items_by_host(host, search)
    return {"host": host, "count": len(items), "items": items}


@app.get("/api/mikrotik/dhcp-active")
def api_mikrotik_dhcp_active(router_id: int | None = None):
    try:
        data = get_dhcp_active(router_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mikrotik/queue-tree")
def api_mikrotik_queue_tree(router_id: int | None = None):
    try:
        data = get_queue_tree(router_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/summary")
def api_report_summary(
    start: str = Query(..., description="Format YYYY-MM-DDTHH:MM"),
    end: str = Query(..., description="Format YYYY-MM-DDTHH:MM")
):
    try:
        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)
        start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start tidak boleh lebih besar dari end")

        summary = build_summary(start_dt, end_dt)
        if not summary:
            raise HTTPException(status_code=404, detail="Tidak ada data yang berhasil dikumpulkan dari Zabbix")

        global_summary = build_global_summary(summary)
        status_count = build_status_count(summary)
        weighted_breakdown = build_weighted_breakdown(summary)
        history_chart = build_history_chart_all(start_dt, end_dt)
        history_bucket_seconds = coerce_bucket_seconds(
            max(end_ts - start_ts, 1),
            get_history_bucket_seconds(start_dt, end_dt)
        )

        return {
            "success": True,
            "start_date": start,
            "end_date": end,
            "period_text": f"{start_dt.strftime('%d-%m-%Y %H:%M')} - {end_dt.strftime('%d-%m-%Y %H:%M')}",
            "total_host": len(summary),
            "status_count": status_count,
            "summary": summary,
            "global_summary": global_summary,
            "weighted_breakdown": weighted_breakdown,
            "history_chart": history_chart,
            "history_meta": {
                "bucket_seconds": history_bucket_seconds,
                "bucket_label": f"{history_bucket_seconds // 60} menit" if history_bucket_seconds < 3600 else f"{history_bucket_seconds // 3600} jam",
                "point_count": len(history_chart),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/export-pdf")
def api_export_pdf(
    start: str = Query(..., description="Format YYYY-MM-DDTHH:MM"),
    end: str = Query(..., description="Format YYYY-MM-DDTHH:MM")
):
    try:
        ensure_output_dir()
        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start tidak boleh lebih besar dari end")

        summary = build_summary(start_dt, end_dt)
        if not summary:
            raise HTTPException(status_code=404, detail="Tidak ada data untuk dibuat PDF")

        make_chart(summary, CHART_PATH)
        make_pie(summary, PIE_PATH)
        make_pdf(summary, start_dt, end_dt, REPORT_PATH)

        return FileResponse(
            REPORT_PATH,
            media_type="application/pdf",
            filename=os.path.basename(REPORT_PATH)
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/chart")
def api_chart(
    start: str = Query(..., description="Format YYYY-MM-DDTHH:MM"),
    end: str = Query(..., description="Format YYYY-MM-DDTHH:MM")
):
    try:
        ensure_output_dir()
        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start tidak boleh lebih besar dari end")

        summary = build_summary(start_dt, end_dt)
        if not summary:
            raise HTTPException(status_code=404, detail="Tidak ada data untuk chart")

        make_chart(summary, CHART_PATH)
        return FileResponse(
            CHART_PATH,
            media_type="image/png",
            filename=os.path.basename(CHART_PATH)
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/pie")
def api_pie(
    start: str = Query(..., description="Format YYYY-MM-DDTHH:MM"),
    end: str = Query(..., description="Format YYYY-MM-DDTHH:MM")
):
    try:
        ensure_output_dir()
        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start tidak boleh lebih besar dari end")

        summary = build_summary(start_dt, end_dt)
        if not summary:
            raise HTTPException(status_code=404, detail="Tidak ada data untuk pie chart")

        make_pie(summary, PIE_PATH)
        return FileResponse(
            PIE_PATH,
            media_type="image/png",
            filename=os.path.basename(PIE_PATH)
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/report/send-email")
def api_send_email(
    start: str = Query(..., description="Format YYYY-MM-DDTHH:MM"),
    end: str = Query(..., description="Format YYYY-MM-DDTHH:MM")
):
    try:
        ensure_output_dir()
        start_dt = parse_datetime(start)
        end_dt = parse_datetime(end)

        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start tidak boleh lebih besar dari end")

        summary = build_summary(start_dt, end_dt)
        if not summary:
            raise HTTPException(status_code=404, detail="Tidak ada data untuk email")

        make_chart(summary, CHART_PATH)
        make_pie(summary, PIE_PATH)
        make_pdf(summary, start_dt, end_dt, REPORT_PATH)
        send_email(summary, start_dt, end_dt, REPORT_PATH)

        return {
            "success": True,
            "message": f"Email berhasil dikirim ke: {', '.join(TO_EMAIL)}",
            "report_path": REPORT_PATH
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def main():
    import uvicorn
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "8005"))
    uvicorn.run(app, host=host, port=port, reload=False, access_log=False)


if __name__ == "__main__":
    main()