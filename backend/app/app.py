#!/usr/bin/env python3
"""
Zabbix Report Backend API - Multi Router History Version
"""

import os
import re
import time
import math
import base64
import smtplib
import traceback
import datetime
import statistics
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from fpdf import FPDF, XPos, YPos
from PIL import Image as PILImage
from html import escape as html_escape
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# PNM letterhead template (extracted from backend/template/PNM.docx)
PNM_HEADER_IMG = str(BASE_DIR / "assets" / "pnm_header.png")
PNM_FOOTER_IMG = str(BASE_DIR / "assets" / "pnm_footer.png")
PNM_HEADER_H   = 210 * 348 / 1820   # full-width A4 -> ~40.1 mm (image is 1820x348)
PNM_FOOTER_H   = 210 * 254 / 1820   # full-width A4 -> ~29.3 mm (image is 1820x254)

try:
    from .mikrotik import get_dhcp_active, get_queue_tree, get_ether_traffic, get_router_status, get_router_list, get_netwatch, get_client_counts
except ImportError:
    from mikrotik import get_dhcp_active, get_queue_tree, get_ether_traffic, get_router_status, get_router_list, get_netwatch, get_client_counts

try:
    from . import noc_history
except ImportError:
    import noc_history

try:
    from . import noc_report
except ImportError:
    import noc_report


ZABBIX_URL = os.getenv("ZABBIX_URL", "http://192.168.1.233/zabbix")
API_TOKEN = os.getenv("ZABBIX_API_TOKEN", "")

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
TO_EMAIL = [email.strip() for email in os.getenv("TO_EMAIL", "").split(",") if email.strip()]
NOC_PUBLIC_URL = os.getenv("NOC_PUBLIC_URL", "").strip().rstrip("/")

WA_ALERT_ENABLED = os.getenv("WA_ALERT_ENABLED", "false").lower() in ("1", "true", "yes", "on")
WA_ALERT_MODE = os.getenv("WA_ALERT_MODE", "cloud").lower()
WA_GRAPH_VERSION = os.getenv("WA_GRAPH_VERSION", "v20.0")
WA_PHONE_NUMBER_ID = os.getenv("WA_PHONE_NUMBER_ID", "")
WA_ACCESS_TOKEN = os.getenv("WA_ACCESS_TOKEN", "")
WA_TO = [n.strip() for n in os.getenv("WA_TO", "").split(",") if n.strip()]
WA_WEB_URL = os.getenv("WA_WEB_URL", "http://127.0.0.1:3100/send")
WA_WEB_FILE_URL = os.getenv("WA_WEB_FILE_URL", WA_WEB_URL.rsplit("/", 1)[0] + "/send-file")
WA_WEB_SECRET = os.getenv("WA_WEB_SECRET", "")

# Rekap NOC bulanan (narasi AI + PDF, dikirim tiap tanggal 1 untuk bulan sebelumnya)
NOC_REPORT_ENABLED = os.getenv("NOC_REPORT_ENABLED", "false").lower() in ("1", "true", "yes", "on")

BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", r"C:\Zabbix")
REPORT_PATH = os.path.join(BASE_OUTPUT_DIR, "Zabbix_Report.pdf")
CHART_PATH = os.path.join(BASE_OUTPUT_DIR, "chart.png")
PIE_PATH = os.path.join(BASE_OUTPUT_DIR, "pie.png")
HISTORY_CHART_PATH = os.path.join(BASE_OUTPUT_DIR, "history_chart.png")
LATENCY_CHART_PATH = os.path.join(BASE_OUTPUT_DIR, "latency_chart.png")

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

# Server Zabbix satu lokasi dengan router ini -> ping ke host ini dianggap LOKAL.
# Semua host lain di-ping menembus tunnel VPN (uplink utama KS Tubun, cadangan Jatake),
# jadi latency/packet loss-nya lebih menggambarkan kesehatan VPN daripada link ISP.
LOCAL_ZABBIX_HOST = "Mikrotik Duta Garden"

# Faktor pengecil bobot komponen kualitas untuk link yang diukur lewat VPN.
VPN_QUALITY_WEIGHT_FACTOR = 0.5

def is_vpn_measured(label: str) -> bool:
    return ITEM_MAP.get(label, {}).get("host", "") != LOCAL_ZABBIX_HOST

# Link cadangan / peruntukan khusus (mis. remote CCTV). Utilisasi rendah adalah
# NORMAL untuk link ini, jadi tidak ditonjolkan sebagai "skor terendah" dan diberi
# catatan supaya tidak disalahartikan sebagai masalah.
STANDBY_LABELS = {
    "Mikrotik Garuda 21 - INDIHOME":
        "Link cadangan / remote CCTV - pemakaian bandwidth rendah adalah normal.",
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

# ─────────────────────────────────────────────
#  SCHEDULED DAILY REPORT  (every day 10:00 WIB)
#  Window: yesterday 03:00  →  today 00:00
# ─────────────────────────────────────────────

def _auto_send_daily_report():
    """Generate yesterday's report (03:00 → 24:00) and send email. Runs every day at 10:00 WIB."""
    today    = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_dt   = today
    start_dt = today - datetime.timedelta(days=1) + datetime.timedelta(hours=3)
    logging.info("Scheduled report: generating %s → %s", start_dt, end_dt)
    try:
        ensure_output_dir()
        summary = build_summary(start_dt, end_dt)
        if not summary:
            logging.warning("Scheduled report: no Zabbix data available — email not sent")
            return
        regenerate_report_assets(summary, start_dt, end_dt)
        dhcp_rows = make_pdf(summary, start_dt, end_dt, REPORT_PATH)
        send_email(summary, start_dt, end_dt, REPORT_PATH, dhcp_rows=dhcp_rows)
        logging.info("Scheduled report: email sent to %s", TO_EMAIL)
    except Exception:
        logging.exception("Scheduled report: failed")


_scheduler = BackgroundScheduler(timezone="Asia/Jakarta")
_scheduler.add_job(
    _auto_send_daily_report,
    CronTrigger(hour=10, minute=0, timezone="Asia/Jakarta"),
    id="daily_report",
    replace_existing=True,
)


@app.on_event("startup")
def _start_scheduler():
    try:
        gap = noc_history.record_monitoring_gap()
        if gap:
            logging.warning(
                "NOC history: jeda pemantauan %s → %s (%ss) — dicatat sebagai blackout",
                gap["started_at"], gap["ended_at"], gap["seconds"],
            )
            # Rekonsiliasi pakai status terkini: perangkat yang masih DOWN dihitung
            # mati sejak sebelum blackout (event diteruskan). Coba beberapa kali
            # kalau Zabbix/MikroTik belum siap tepat setelah boot.
            live = None
            for _ in range(3):
                try:
                    live = build_noc_live()
                    break
                except Exception:
                    time.sleep(5)
            if live:
                ents = [{"kind": "site", "key": f"site:{s['label']}", "name": s["label"], "state": s["state"]}
                        for s in live.get("sites", [])]
                # "since" dari MikroTik Netwatch dipakai reconcile_after_gap buat
                # nentuin persis kapan transisi terjadi selama blackout (router
                # tetap jalan sendiri walau backend kita mati), bukan asal nebak
                # "baru saja" pas backend nyala lagi.
                ents += [{"kind": "device", "key": _device_key(d), "name": d.get("name") or "-",
                          "state": d["state"], "since": d.get("since")}
                         for d in live.get("devices", [])]
                noc_history.reconcile_after_gap(ents, gap["started_at"])
            else:
                logging.warning("NOC history: status live belum tersedia saat startup — event lama ditutup di titik terakhir")
                noc_history.close_stale_open_events(close_at=gap["started_at"])
        else:
            noc_history.close_stale_open_events()
    except Exception:
        logging.exception("NOC history: gagal rekonsiliasi event saat startup")
    _cleanup_noc_history()
    _scheduler.start()
    logging.info(
        "Scheduler started — daily report runs every day 10:00 WIB; NOC history polling every %ss; cleanup monthly retention %s days",
        NOC_HISTORY_POLL_SECONDS,
        NOC_HISTORY_RETENTION_DAYS,
    )


@app.on_event("shutdown")
def _stop_scheduler():
    _scheduler.shutdown(wait=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOSTID_CACHE: Dict[str, str] = {}
ITEMID_CACHE: Dict[Tuple[str, str], str] = {}
ITEMID_BY_KEY_CACHE: Dict[Tuple[str, str], Optional[str]] = {}
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
            logging.error("Zabbix API error (%s): %s", method, response["error"])
            return []

        return response.get("result", [])
    except requests.exceptions.RequestException as e:
        logging.exception("Zabbix request failed (%s): %s", method, e)
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
        logging.warning("Host tidak ditemukan di Zabbix: %s", host_name)
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


def find_itemid_by_key(host_name: str, key_base: str) -> Optional[str]:
    """Cari itemid berdasarkan key Zabbix (mis. 'icmppingsec', 'icmppingloss')."""
    cache_key = (host_name, key_base)
    if cache_key in ITEMID_BY_KEY_CACHE:
        return ITEMID_BY_KEY_CACHE[cache_key]

    hostid = find_hostid(host_name)
    if not hostid:
        ITEMID_BY_KEY_CACHE[cache_key] = None
        return None

    items = zabbix_request("item.get", {
        "output": ["itemid", "key_", "name"],
        "hostids": [hostid],
        "search": {"key_": key_base},
        "limit": 25
    })

    chosen = None
    for it in items:
        if it.get("key_", "").split("[")[0] == key_base:
            chosen = it["itemid"]
            break
    if chosen is None and items:
        chosen = items[0]["itemid"]

    ITEMID_BY_KEY_CACHE[cache_key] = chosen
    return chosen


def get_latency_stats(host_name: str, start_ts: int, end_ts: int) -> Dict[str, float]:
    """Statistik latency (ICMP response time) & packet loss untuk sebuah host."""
    out: Dict[str, float] = {
        "latency_avg_ms": 0.0,
        "latency_p95_ms": 0.0,
        "latency_max_ms": 0.0,
        "loss_avg_pct": 0.0,
        "loss_max_pct": 0.0,
        "latency_sample": 0,
    }

    sec_id = find_itemid_by_key(host_name, "icmppingsec")
    if sec_id:
        hist = get_item_history(sec_id, start_ts, end_ts)
        vals = []
        for h in hist:
            if "value" not in h:
                continue
            v = float(h["value"]) * 1000.0  # detik -> ms
            if math.isnan(v) or v < 0:
                continue
            vals.append(v)
        if vals:
            out["latency_avg_ms"] = round(statistics.mean(vals), 1)
            out["latency_p95_ms"] = (
                round(percentile(vals, 95), 1)
                if len(vals) >= MIN_SAMPLES_FOR_PERCENTILE
                else round(max(vals), 1)
            )
            out["latency_max_ms"] = round(max(vals), 1)
            out["latency_sample"] = len(vals)

    loss_id = find_itemid_by_key(host_name, "icmppingloss")
    if loss_id:
        hist = get_item_history(loss_id, start_ts, end_ts)
        vals = []
        for h in hist:
            if "value" not in h:
                continue
            v = float(h["value"])
            if math.isnan(v) or v < 0:
                continue
            vals.append(v)
        if vals:
            out["loss_avg_pct"] = round(statistics.mean(vals), 2)
            out["loss_max_pct"] = round(max(vals), 2)

    return out


def classify_connection_quality(lat: Dict[str, float]) -> str:
    """Kategori kualitas koneksi dari latency P95 & packet loss."""
    if lat.get("latency_sample", 0) == 0:
        return "-"
    # Pakai rata-rata loss, bukan max — 1 ping gagal dari 3 sample = 33% max
    # tapi itu cuma blip sesaat, bukan gambaran kualitas periode.
    if lat["loss_avg_pct"] >= 2.0 or lat["latency_p95_ms"] >= 150:
        return "BURUK"
    if lat["loss_avg_pct"] >= 0.5 or lat["latency_p95_ms"] >= 80:
        return "CUKUP"
    return "BAIK"


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


def get_hourly_usage_dual(
    host_name: str,
    recv_items: List[str],
    sent_items: List[str],
    start_ts: int,
    end_ts: int,
    capacity_mbps: float
) -> Dict[int, Dict[str, float]]:
    """Rata-rata bandwidth per jam (0-23). Untuk laporan harian."""
    results: Dict[int, Dict[str, float]] = {}

    recv_itemid, _ = find_first_valid_itemid(host_name, recv_items)
    sent_itemid, _ = find_first_valid_itemid(host_name, sent_items)

    def accumulate(itemid: str, key: str):
        hist = get_item_history(itemid, start_ts, end_ts)
        per_hour: Dict[int, List[float]] = {}
        for h in hist:
            hour = datetime.datetime.fromtimestamp(int(h["clock"])).hour
            per_hour.setdefault(hour, []).append(float(h["value"]) / 1_000_000)
        for hour, values in per_hour.items():
            cleaned = sanitize_bandwidth_samples(values, capacity_mbps)
            if not cleaned:
                continue
            results.setdefault(hour, {"download": 0.0, "upload": 0.0, "total": 0.0})
            results[hour][key] = round(statistics.mean(cleaned), 2)

    if recv_itemid:
        accumulate(recv_itemid, "download")
    if sent_itemid:
        accumulate(sent_itemid, "upload")

    for hour in results:
        results[hour]["total"] = round(results[hour]["download"] + results[hour]["upload"], 2)

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


def build_latency_history_all(
    start_dt: datetime.datetime, end_dt: datetime.datetime
) -> Dict[str, List[Dict]]:
    """Tren latency (ms) per host, sudah di-bucket. Key = nama host (bukan per-ISP)."""
    from collections import OrderedDict

    start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)
    total_seconds = max(end_ts - start_ts, 1)
    bucket_seconds = coerce_bucket_seconds(
        total_seconds, get_history_bucket_seconds(start_dt, end_dt)
    )

    seen_hosts: List[str] = []
    for cfg in ITEM_MAP.values():
        h = cfg.get("host", "").strip()
        if h and h not in seen_hosts:
            seen_hosts.append(h)

    out: Dict[str, List[Dict]] = OrderedDict()
    for host_name in seen_hosts:
        sec_id = find_itemid_by_key(host_name, "icmppingsec")
        if not sec_id:
            continue
        hist = get_item_history(sec_id, start_ts, end_ts)
        buckets: Dict[int, List[float]] = {}
        for row in hist:
            if "value" not in row:
                continue
            ms = float(row["value"]) * 1000.0
            if math.isnan(ms) or ms < 0:
                continue
            clock = int(row["clock"])
            bucket_clock = start_ts + (((clock - start_ts) // bucket_seconds) * bucket_seconds)
            buckets.setdefault(bucket_clock, []).append(ms)

        points = [
            {
                "time": datetime.datetime.fromtimestamp(bc).strftime("%Y-%m-%d %H:%M:%S"),
                "latency": round(statistics.mean(vals), 1),
                "latency_max": round(max(vals), 1),
            }
            for bc, vals in sorted(buckets.items())
        ]
        if points:
            out[host_name] = points

    return out


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def compute_link_score(
    max_avg_pct: float,
    max_p95_pct: float,
    max_peak_pct: float,
    latency_p95_ms: float,
    loss_avg_pct: float,
    quality_weight_factor: float = 1.0,
) -> Dict[str, float]:
    """Skor kesehatan/kepadatan link (0-100, makin tinggi = makin perlu perhatian).

    Menggabungkan SEMUA faktor, bukan hanya utilisasi:
      1. Utilisasi (dominan) - rata-rata, P95, dan peak sesaat terhadap kapasitas.
      2. Kualitas link (koreksi) - latency P95 & packet loss rata-rata.

    util_score  = 0.50*Avg% + 0.35*P95% + 0.15*Peak%   (dibatasi 0-100)
    quality_pen = dimensi terburuk antara latency & loss, dipetakan ke 0-100
                    latency: 20 ms -> 0 , 150 ms -> 100
                    loss   :  0 %  -> 0 ,   5 % -> 100
    weighted_score = 0.80*util_score + 0.20*quality_pen*quality_weight_factor

    quality_weight_factor < 1.0 dipakai untuk link yang latency/loss-nya diukur
    lewat VPN (angkanya lebih menggambarkan kesehatan VPN daripada link ISP).
    """
    util_score = _clamp(
        0.50 * max_avg_pct + 0.35 * max_p95_pct + 0.15 * min(max_peak_pct, 120.0)
    )

    latency_penalty = _clamp((latency_p95_ms - 20.0) / (150.0 - 20.0) * 100.0)
    loss_penalty = _clamp(loss_avg_pct / 5.0 * 100.0)
    quality_penalty = max(latency_penalty, loss_penalty)

    util_contribution = 0.80 * util_score
    quality_contribution = 0.20 * quality_penalty * quality_weight_factor
    weighted_score = _clamp(util_contribution + quality_contribution)

    return {
        "util_score": round(util_score, 1),
        "latency_penalty": round(latency_penalty, 1),
        "loss_penalty": round(loss_penalty, 1),
        "quality_penalty": round(quality_penalty, 1),
        "util_contribution": round(util_contribution, 1),
        "quality_contribution": round(quality_contribution, 1),
        "weighted_score": round(weighted_score, 1),
    }


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

        latency = get_latency_stats(host_name, start_ts, end_ts)
        conn_quality = classify_connection_quality(latency)

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
        pct_peak_download = round((peak_download / cap) * 100, 1) if cap else 0.0
        pct_peak_upload = round((peak_upload / cap) * 100, 1) if cap else 0.0

        max_avg_pct = max(pct_avg_download, pct_avg_upload)
        max_peak_pct = max(pct_p95_download, pct_p95_upload)   # P95 utilisasi (label historis)
        max_peakraw_pct = max(pct_peak_download, pct_peak_upload)

        vpn_measured = is_vpn_measured(label)
        standby_note = STANDBY_LABELS.get(label, "")
        is_standby = bool(standby_note)

        score_parts = compute_link_score(
            max_avg_pct, max_peak_pct, max_peakraw_pct,
            latency["latency_p95_ms"], latency["loss_avg_pct"],
            quality_weight_factor=(VPN_QUALITY_WEIGHT_FACTOR if vpn_measured else 1.0),
        )
        util_score = score_parts["util_score"]
        latency_penalty = score_parts["latency_penalty"]
        loss_penalty = score_parts["loss_penalty"]
        quality_penalty = score_parts["quality_penalty"]
        weighted_score = score_parts["weighted_score"]

        # Kategori status dari Weighted Score, dengan PENGAMAN UTILISASI:
        # karena kualitas link hanya menyumbang maksimal 20 poin, link yang nyaris
        # penuh (util_score tinggi) tidak akan pernah mencapai Weighted Score > 80.
        # Pengaman ini memastikan link mendekati batas kapasitas tetap berstatus
        # TINGGI walau latency & packet loss-nya bagus.
        if weighted_score >= 80 or util_score >= 90:
            status = "TINGGI"
            color = (255, 70, 70)
            solusi = "Perlu monitoring intensif dan evaluasi upgrade kapasitas segera."
        elif weighted_score >= 60 or util_score >= 70:
            status = "PADAT"
            color = (255, 190, 80)
            solusi = "Pantau jam sibuk dan pertimbangkan optimasi traffic atau QoS."
        else:
            status = "STABIL"
            color = (90, 200, 90)
            solusi = "Pemakaian normal. Lanjutkan monitoring rutin."

        # Pengaman kualitas: link yang di-ping LANGSUNG (bukan lewat VPN) dengan
        # kualitas BURUK tidak boleh berstatus STABIL - dinaikkan ke PADAT sebagai
        # penanda perlu investigasi. Untuk link yang diukur lewat VPN, status TIDAK
        # dinaikkan (angka latency/loss-nya mengukur VPN, bukan link ISP itu) -
        # cukup diberi catatan.
        quality_note = ""
        if conn_quality == "BURUK" and status == "STABIL" and not vpn_measured:
            status = "PADAT"
            color = (255, 190, 80)
            solusi = ("Utilisasi bandwidth masih wajar, tetapi kualitas link BURUK "
                      "(latency / packet loss tinggi). Periksa gangguan link atau hubungi ISP.")
            quality_note = "naik dari STABIL karena kualitas link BURUK"
        elif conn_quality == "BURUK" and vpn_measured:
            quality_note = ("latency / packet loss tinggi terukur, tetapi via jalur VPN "
                            "(uplink KS Tubun / Jatake) - periksa kesehatan VPN, belum tentu link ini")

        # Alasan status (dipakai di narasi laporan) - komponen mana yang dominan.
        lat_p95 = latency["latency_p95_ms"]
        loss_avg = latency["loss_avg_pct"]
        _jalur = "jalur VPN" if vpn_measured else "jalur ukur"
        if status == "STABIL":
            status_reason = (
                f"utilisasi link rendah ({util_score:.0f}% kapasitas) "
                f"dan kualitas {_jalur} {conn_quality.lower()}"
            )
        elif score_parts["util_contribution"] >= score_parts["quality_contribution"]:
            status_reason = (
                f"utilisasi link mencapai {util_score:.0f}% kapasitas "
                f"(gabungan rata-rata, P95, dan puncak arah tersibuk)"
            )
        elif latency_penalty >= loss_penalty:
            status_reason = (
                f"latency P95 {_jalur} {lat_p95:.0f} ms (di atas ambang wajar 20-80 ms)"
                + ("; bobot dikecilkan karena via VPN" if vpn_measured else "")
            )
        else:
            status_reason = (
                f"packet loss rata-rata {_jalur} {loss_avg:.1f}% (di atas ambang wajar < 0,5%)"
                + ("; bobot dikecilkan karena via VPN" if vpn_measured else "")
            )

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
            "pct_peak_download": pct_peak_download,
            "pct_peak_upload": pct_peak_upload,
            "max_avg_pct": max_avg_pct,
            "max_peak_pct": max_peak_pct,
            "max_peakraw_pct": max_peakraw_pct,
            "util_score": util_score,
            "latency_penalty": latency_penalty,
            "loss_penalty": loss_penalty,
            "quality_penalty": quality_penalty,
            "util_contribution": score_parts["util_contribution"],
            "quality_contribution": score_parts["quality_contribution"],
            "weighted_score": weighted_score,
            "status": status,
            "status_reason": status_reason,
            "vpn_measured": vpn_measured,
            "is_standby": is_standby,
            "standby_note": standby_note,
            "color": color,
            "solusi": solusi,
            "quality_note": quality_note,
            "recv_item_name": matched_recv,
            "recv_itemid": recv_itemid,
            "sent_item_name": matched_sent,
            "sent_itemid": sent_itemid,
            "recv_sample_raw": recv_stats["sample_count_raw"],
            "recv_sample_used": recv_stats["sample_count_used"],
            "sent_sample_raw": sent_stats["sample_count_raw"],
            "sent_sample_used": sent_stats["sample_count_used"],
            "latency_avg_ms": latency["latency_avg_ms"],
            "latency_p95_ms": latency["latency_p95_ms"],
            "latency_max_ms": latency["latency_max_ms"],
            "loss_avg_pct": latency["loss_avg_pct"],
            "loss_max_pct": latency["loss_max_pct"],
            "latency_sample": latency["latency_sample"],
            "conn_quality": conn_quality
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


DHCP_REPORT_ROUTER_TIMEOUT = 8   # detik per router
DHCP_REPORT_TOTAL_TIMEOUT   = 25  # detik total — jangan pernah blokir laporan lebih dari ini


def build_dhcp_active_summary() -> List[Dict]:
    """Jumlah user aktif (DHCP lease 'bound') per router — snapshot saat laporan dibuat.

    Setiap router di-query paralel dengan batas waktu, supaya router yang mati
    tidak memblokir pembuatan laporan.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    try:
        routers = get_router_list()
    except Exception:
        logging.exception("DHCP active: gagal membaca daftar router")
        return []
    if not routers:
        return []

    def count_one(router):
        name = router.get("router_name") or router.get("router_host") or "MikroTik"
        leases = get_dhcp_active(router_id=router["router_id"])
        return name, len(leases)

    per_router: Dict[str, int] = {}
    pool = ThreadPoolExecutor(max_workers=min(len(routers), 8))
    try:
        futures = {pool.submit(count_one, r): r for r in routers}
        try:
            for fut in as_completed(futures, timeout=DHCP_REPORT_TOTAL_TIMEOUT):
                try:
                    name, count = fut.result(timeout=DHCP_REPORT_ROUTER_TIMEOUT)
                    per_router[name] = count
                except Exception as e:
                    r = futures[fut]
                    logging.warning("DHCP active: router %s gagal - %s", r.get("router_name"), e)
        except Exception:
            logging.warning("DHCP active: sebagian router timeout, pakai data yang ada")
    finally:
        # Jangan tunggu thread yang masih nyangkut di socket router mati
        pool.shutdown(wait=False)

    return [
        {"router": name, "active": count}
        for name, count in sorted(per_router.items())
    ]


def match_dhcp_active(label: str, dhcp_rows: List[Dict]):
    """Cari jumlah user aktif DHCP untuk sebuah lokasi summary (mis. 'Mikrotik Duta
    Garden - BIZNET') dengan mencocokkan kata kunci ke nama router. None kalau tak ada."""
    if not dhcp_rows:
        return None
    loc = label.replace("Mikrotik", "").split(" - ")[0]
    loc_words = {w for w in loc.lower().split() if len(w) > 2}
    if not loc_words:
        return None
    best_overlap, best_val = 0, None
    for d in dhcp_rows:
        rw = {w for w in str(d["router"]).lower().split() if len(w) > 2}
        overlap = len(loc_words & rw)
        if overlap > best_overlap:
            best_overlap, best_val = overlap, d["active"]
    return best_val


# Ambang kepadatan user = kapasitas link (Mbps) dibagi jumlah user aktif
USER_DENSITY_PADAT  = 2.0   # < 2 Mbps tersedia per user  -> PADAT
USER_DENSITY_SEDANG = 5.0   # 2-5 Mbps per user           -> SEDANG,  >= 5 -> LONGGAR


def classify_user_density(cap: float, users: int):
    """(label, mbps_per_user) berdasarkan kapasitas link per user aktif. None kalau data kurang."""
    if not users or not cap:
        return None
    per = cap / users
    if per < USER_DENSITY_PADAT:
        return ("PADAT", per)
    if per < USER_DENSITY_SEDANG:
        return ("SEDANG", per)
    return ("LONGGAR", per)


# ─────────────────────────────────────────────
#  PDF CLASS  —  Modern Professional Design
# ─────────────────────────────────────────────

# Colour palette
_C_NAVY    = (11,  11,  96)   # PNM letterhead navy – primary brand
_C_ACCENT  = (227, 150,  24)  # PNM letterhead gold – accent line / highlights
_C_GOLD    = (227, 150,  24)  # PNM letterhead gold – secondary accent
_C_GOLD_LT = (246, 248, 251)  # cool light tint – alternating table rows
_C_BG      = (245, 247, 250)  # near-white background for alternating rows
_C_BORDER  = (223, 228, 236)  # light cool-grey table border
_C_BODY    = (33,  41,  54)   # near-black body text (slate)
_C_MUTED   = (108, 117, 133)  # muted/secondary text
_C_WHITE   = (255, 255, 255)

# Status colour chips  (filled badge style)
_STATUS_COLORS = {
    "TINGGI": (220,  53,  69),   # red
    "PADAT":  (255, 163,  47),   # amber
    "STABIL": ( 32, 178, 100),   # green
}

# Rounded pill badges — soft tint background + coloured text (matches dashboard)
_BADGE_RED   = {"fg": (176, 35, 24),  "bg": (250, 226, 223)}
_BADGE_AMBER = {"fg": (138, 104, 15), "bg": (250, 242, 221)}
_BADGE_GREEN = {"fg": (24, 120, 110), "bg": (223, 243, 240)}
_BADGE_GREY  = {"fg": (110, 120, 135), "bg": (238, 240, 243)}

_STATUS_BADGE = {
    "TINGGI": _BADGE_RED,
    "PADAT":  _BADGE_AMBER,
    "STABIL": _BADGE_GREEN,
}
_QUALITY_BADGE = {
    "BAIK":  _BADGE_GREEN,
    "CUKUP": _BADGE_AMBER,
    "BURUK": _BADGE_RED,
    "-":     _BADGE_GREY,
}


class PDF(FPDF):
    # ── header  (PNM letterhead template) ─────
    def header(self):
        # Full-width letterhead image from PNM.docx template — on every page
        if os.path.exists(PNM_HEADER_IMG):
            self.image(PNM_HEADER_IMG, x=0, y=0, w=210)

        # Start content just below the letterhead (no rule)
        self.set_y(PNM_HEADER_H + 6)

    # ── report title  (page 1 only) ──────────
    def report_title(self):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(0, 0, 0)
        self.set_char_spacing(1.0)
        self.cell(0, 8, "LAPORAN TRAFIK JARINGAN", align="C",
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_char_spacing(0)
        self.ln(2)

    # ── helper: modern table header band ──────
    def table_header(self, widths, labels, head_h=7.5):
        self.set_font("Helvetica", "B", 6.8)
        self.set_char_spacing(0.4)
        self.set_fill_color(*_C_NAVY)
        self.set_text_color(*_C_WHITE)
        x0, y0 = self.get_x(), self.get_y()
        for i, (w, lab) in enumerate(zip(widths, labels)):
            txt = (" " + lab.upper()) if i == 0 else lab.upper()
            self.cell(w, head_h, txt, border=0, fill=True,
                      align="L" if i == 0 else "C",
                      new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_char_spacing(0)
        # gold accent underline
        self.set_draw_color(*_C_ACCENT)
        self.set_line_width(0.5)
        self.line(x0, y0 + head_h, x0 + sum(widths), y0 + head_h)
        self.set_draw_color(*_C_BORDER)
        self.set_line_width(0.2)
        self.set_xy(x0, y0 + head_h)

    # ── footer  (PNM template + page number) ──
    def footer(self):
        # Full-width decorative footer image from PNM.docx template
        if os.path.exists(PNM_FOOTER_IMG):
            self.image(PNM_FOOTER_IMG, x=0, y=297 - PNM_FOOTER_H, w=210)

        self.set_y(-11)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*_C_MUTED)
        self.cell(95, 5, "PT Pilar Niaga Makmur  -  Confidential", align="L")
        self.cell(95, 5, f"Halaman {self.page_no()}", align="R")

    # ── helper: reserve vertical space, page-break only if it doesn't fit ──
    def ensure_space(self, need_mm: float):
        if self.get_y() + need_mm > self.page_break_trigger:
            self.add_page()

    # ── helper: rounded status pill (badge, dashboard style) ──
    def status_pill(self, x, y, cell_w, cell_h, text, fg_rgb, bg_rgb):
        self.set_font("Helvetica", "B", 6.5)
        pill_w = min(self.get_string_width(text) + 5.0, cell_w - 2)
        pill_h = 4.4
        px = x + (cell_w - pill_w) / 2
        py = y + (cell_h - pill_h) / 2
        self.set_fill_color(*bg_rgb)
        self.rect(px, py, pill_w, pill_h, style="F",
                  round_corners=True, corner_radius=pill_h / 2)
        self.set_text_color(*fg_rgb)
        self.set_xy(px, py)
        self.cell(pill_w, pill_h, text, align="C")
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*_C_BODY)

    # ── helper: section title ─────────────────
    def section_title(self, text: str):
        # Pastikan bar + judul tidak terpisah oleh page-break (bar nyangkut sendirian)
        if self.get_y() + 12 > self.page_break_trigger:
            self.add_page()
        self.ln(3)
        x0, y = self.l_margin, self.get_y()
        # slim rounded accent tick (bukan blok tebal)
        self.set_fill_color(*_C_ACCENT)
        self.rect(x0, y + 0.7, 1.3, 4.4, style="F", round_corners=True, corner_radius=0.65)
        self.set_xy(x0 + 3.6, y)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*_C_NAVY)
        self.set_char_spacing(0.2)
        self.cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_char_spacing(0)
        # hairline pemisah tipis
        self.set_draw_color(*_C_BORDER)
        self.set_line_width(0.2)
        ry = self.get_y() + 0.4
        self.line(x0, ry, x0 + 190, ry)
        self.ln(3)

    # ── helper: small sub-heading (dalam bagian, lebih kecil dari section_title) ──
    def sub_heading(self, text: str):
        self.ln(1)
        x0, y = self.l_margin, self.get_y()
        self.set_fill_color(*_C_ACCENT)
        self.rect(x0, y + 0.5, 1.0, 3.4, style="F", round_corners=True, corner_radius=0.5)
        self.set_xy(x0 + 2.8, y)
        self.set_font("Helvetica", "B", 8.5)
        self.set_text_color(*_C_NAVY)
        self.set_char_spacing(0.3)
        self.cell(0, 5, text.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_char_spacing(0)
        self.ln(1.5)

    # ── helper: baris bullet "Label" + keterangan indent (hanging) ──
    def bullet(self, label: str, text: str):
        indent = self.l_margin + 4.4
        # jaga blok label+teks tidak terpotong page-break di tengah
        self.ensure_space(14)
        y0 = self.get_y()

        # marker dash emas
        self.set_xy(self.l_margin + 1.0, y0)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*_C_ACCENT)
        self.cell(3.2, 4.6, "-")

        # label di baris sendiri (navy, bold)
        self.set_xy(indent, y0)
        self.set_font("Helvetica", "B", 7.8)
        self.set_text_color(*_C_NAVY)
        self.cell(0, 4.6, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # keterangan: rata kiri konsisten di bawah label (hanging indent)
        saved = self.l_margin
        self.set_left_margin(indent)
        self.set_x(indent)
        self.set_font("Helvetica", "", 7.6)
        self.set_text_color(*_C_BODY)
        self.multi_cell(190 - (indent - saved), 4.4, text, align="L",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_left_margin(saved)
        self.ln(2.0)

    # ── helper: strip kotak statistik ringkas ──
    def stat_strip(self, items):
        x0, y = self.l_margin, self.get_y()
        gap, h = 2.4, 11.5
        w = (190 - gap * (len(items) - 1)) / len(items)
        for i, (lab, val) in enumerate(items):
            x = x0 + i * (w + gap)
            self.set_fill_color(*_C_GOLD_LT)
            self.set_draw_color(*_C_BORDER)
            self.set_line_width(0.2)
            self.rect(x, y, w, h, style="DF", round_corners=True, corner_radius=1.6)
            self.set_xy(x, y + 1.6)
            self.set_font("Helvetica", "B", 11)
            self.set_text_color(*_C_NAVY)
            self.cell(w, 5, str(val), align="C")
            self.set_xy(x, y + 7.0)
            self.set_font("Helvetica", "", 5.8)
            self.set_text_color(*_C_MUTED)
            self.set_char_spacing(0.2)
            self.cell(w, 3.4, lab.upper(), align="C")
            self.set_char_spacing(0)
        self.set_xy(x0, y + h + 2)


def make_pdf(summary: List[Dict], start_dt: datetime.datetime, end_dt: datetime.datetime,
             output_path: str = REPORT_PATH, ai_summary: Optional[str] = None):
    pdf = PDF()
    # Leave room for the PNM letterhead (top) and decorative footer (bottom)
    pdf.set_top_margin(PNM_HEADER_H + 9)
    pdf.set_auto_page_break(True, margin=PNM_FOOTER_H + 6)
    pdf.add_page()

    # ── Report title — page 1 only, for a cleaner look ──
    pdf.report_title()

    # ── Period badge ──────────────────────────
    periode = f"Periode:  {start_dt.strftime('%d-%m-%Y %H:%M')}  -  {end_dt.strftime('%d-%m-%Y %H:%M')}"
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_C_MUTED)
    pdf.cell(0, 6, periode, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ── Ringkasan eksekutif (satu paragraf, tanpa card) ──
    _sc = build_status_count(summary)
    # Data user aktif DHCP (dipakai di ringkasan, analisa per lokasi, analisa global, tabel DHCP)
    dhcp_rows = build_dhcp_active_summary()
    _lat_vals = [r["latency_avg_ms"] for r in summary if r.get("latency_sample", 0)]
    _avg_latency = round(statistics.mean(_lat_vals), 1) if _lat_vals else 0.0
    _lat_pool = [r for r in summary if not r.get("is_standby")] or summary
    _worst = max(_lat_pool, key=lambda r: r.get("latency_p95_ms", 0.0)) if _lat_pool else None
    _worst_txt = (
        f"{_worst['latency_p95_ms']:.0f} ms ({_worst['label']}"
        + (", via VPN" if _worst.get("vpn_measured") else "") + ")"
        if _worst and _worst.get("latency_sample", 0) else "-"
    )
    pdf.sub_heading("Ringkasan Eksekutif")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_C_BODY)
    pdf.multi_cell(0, 4.6,
        f"Periode ini memantau {len(summary)} host/ISP. Angka-angka kunci:")
    pdf.ln(1.5)
    _strip = [
        ("Total Host",  len(summary)),
        ("Stabil",      _sc.get("STABIL", 0)),
        ("Padat",       _sc.get("PADAT", 0)),
        ("Tinggi",      _sc.get("TINGGI", 0)),
        ("Avg Latency", f"{_avg_latency:.0f} ms"),
    ]
    if dhcp_rows:
        _strip.append(("User Aktif", sum(d["active"] for d in dhcp_rows)))
    pdf.stat_strip(_strip)
    pdf.ln(1)
    pdf.set_font("Helvetica", "I", 7.2)
    pdf.set_text_color(*_C_MUTED)
    pdf.multi_cell(0, 4, f"P95 latency tertinggi: {_worst_txt}.")
    pdf.ln(2)

    # ── Ringkasan AI (opsional; dipakai di laporan mingguan) ──
    if ai_summary:
        def _lat1(s):
            return (s or "").replace("–", "-").replace("—", "-").replace("’", "'") \
                .replace("•", "-").replace("…", "...").replace("→", "->") \
                .encode("latin-1", "replace").decode("latin-1")
        pdf.sub_heading("Ringkasan AI")
        _AI_HEADS = ("status keseluruhan", "ringkasan eksekutif", "keandalan & gangguan",
                     "keandalan dan gangguan", "kejadian penting",
                     "kualitas koneksi (latency & packet loss)", "kualitas koneksi",
                     "kapasitas & beban bandwidth", "kapasitas & beban",
                     "kapasitas dan beban bandwidth", "rekomendasi",
                     "site yang perlu perhatian", "pola berulang")
        for para in ai_summary.split("\n"):
            para = _lat1(re.sub(r"[*#`]+", "", para).strip())
            para = re.sub(r"^\d+[\.\)]\s*", "", para)
            para = re.sub(r"^[•·]\s*", "- ", para)
            if not para:
                pdf.ln(1.2)
                continue
            is_bullet = para.startswith("- ")
            _low = para.lower().rstrip(":")
            is_head = not is_bullet and ((para.endswith(":") and len(para) < 55) or _low in _AI_HEADS)
            pdf.set_font("Helvetica", "B" if is_head else "", 8 if is_head else 7.8)
            pdf.set_text_color(*(_C_NAVY if is_head else _C_BODY))
            pdf.set_x(pdf.l_margin + (3.0 if is_bullet else 0))
            if is_head:
                pdf.ln(0.8)
            try:
                pdf.multi_cell(0, 4.4, para)
            except Exception:
                pass
        pdf.ln(2)

    # ── Metodologi penilaian ──
    pdf.section_title("Cara Menilai: Stabil / Padat / Tinggi")
    pdf.set_font("Helvetica", "I", 7.4)
    pdf.set_text_color(*_C_MUTED)
    pdf.multi_cell(0, 4.2,
        "Status tiap host ditentukan oleh Weighted Score (0-100). Makin tinggi skor, "
        "makin dekat link ke batas kapasitas atau makin buruk kualitasnya.", align="L")
    pdf.ln(2)

    pdf.bullet("Weighted Score",
               "Skor gabungan: (80% x Utilisasi) + (20% x Kualitas Link).")
    pdf.bullet("Komponen Utilisasi",
               "(0,50 x Avg%) + (0,35 x P95%) + (0,15 x Peak%) terhadap kapasitas link, "
               "diambil dari arah yang lebih tinggi antara Download atau Upload.")
    pdf.bullet("Komponen Kualitas Link",
               "Nilai terburuk antara latency P95 (20 ms -> 0, 150 ms -> 100) dan "
               "packet loss rata-rata (0% -> 0, 5% -> 100). Bobotnya kecil (20%) dan "
               "hanya berperan sebagai koreksi, bukan penentu utama.")
    pdf.bullet("Kategori Status",
               "STABIL: Weighted Score < 60.  "
               "PADAT: Weighted Score 60-79, ATAU utilisasi link >= 70% kapasitas.  "
               "TINGGI: Weighted Score >= 80, ATAU utilisasi link >= 90% kapasitas "
               "(mendekati batas, perlu evaluasi upgrade).")
    pdf.bullet("Pengaman Utilisasi",
               "Karena komponen kualitas hanya menyumbang maksimal 20 poin, link yang "
               "nyaris penuh tetap dinaikkan ke PADAT / TINGGI berdasar utilisasi murni, "
               "walau latency & packet loss-nya bagus.")
    pdf.bullet("Pengaman Kualitas",
               "Sebaliknya, jika kualitas jalur ukur BURUK, status minimal dinaikkan ke "
               "PADAT walau utilisasi rendah - sebagai penanda perlu investigasi.")
    pdf.bullet("Koreksi Link via VPN",
               "Server Zabbix ada di Duta Garden. Site lain di-ping menembus VPN "
               "(uplink KS Tubun / Jatake), jadi latency & packet loss-nya mengukur VPN, "
               "bukan link ISP. Untuk link ini bobot kualitas dikecilkan 50% dan tidak "
               "dipakai menaikkan status - status praktis ditentukan oleh utilisasi saja.")
    pdf.bullet("Link Cadangan / CCTV",
               "Sebagian link (mis. Garuda 21) hanya untuk remote CCTV / cadangan. "
               "Utilisasi rendah adalah normal dan tidak ditandai sebagai masalah.")

    pdf.ln(1)
    pdf.sub_heading("Istilah pendukung")
    pdf.bullet("Utilisasi",
               "Pemakaian bandwidth dibagi kapasitas link, dalam persen. "
               "Contoh: rata-rata 40 Mbps pada link 100 Mbps = utilisasi 40%.")
    pdf.bullet("P95 (persentil ke-95)",
               "Level bandwidth yang tidak terlampaui selama 95% waktu pengukuran. "
               "5% sampel tertinggi (lonjakan sesaat) diabaikan, sehingga angka ini "
               "menggambarkan beban sibuk yang wajar, bukan spike ekstrem.")
    pdf.bullet("Peak (kolom tabel)",
               "Nilai MAX absolut selama periode - gambaran puncak sesaat. Ikut dihitung "
               "dalam Weighted Score dengan bobot kecil (15% dari komponen utilisasi).")
    pdf.bullet("Kepadatan User (DHCP)",
               "Indikator terpisah dari Weighted Score: kapasitas link dibagi jumlah user aktif. "
               "LONGGAR di atas 5 Mbps/user; SEDANG 2-5; PADAT di bawah 2. "
               "Dipakai menajamkan rekomendasi (upgrade vs QoS), bukan menentukan status trafik.")
    pdf.bullet("Latency & Packet Loss",
               "Diukur dari ICMP ping server Zabbix ke IP masing-masing router. "
               "Angka ini menggambarkan kualitas JALUR UKUR (yang dapat melewati VPN / "
               "tunnel manajemen), bukan tentu kualitas internet dari sisi ISP. "
               "Latency / loss tinggi pada satu link perlu dicek dulu: gangguan di link "
               "ISP, atau di jalur VPN menuju router.")
    pdf.ln(3)

    # ── Summary table ─────────────────────────
    pdf.section_title("Ringkasan Trafik Jaringan")

    # Total usable width = 190mm. Columns must sum to exactly 190.
    # Host/ISP wider, Cap narrow, numeric cols equal, Status fixed
    COL_W  = [52, 14, 21, 21, 21, 21, 18, 22]   # sum = 190
    HEADS  = ["Host / ISP", "Cap", "Avg Down", "Avg Up", "Peak Down", "Peak Up", "Score", "Status"]
    HEAD_H = 7.5  # single-line header
    ROW_H  = 8    # data row height — enough padding top/bottom

    # ── Header ──
    pdf.table_header(COL_W, HEADS, HEAD_H)

    # ── Data rows ──
    pdf.set_font("Helvetica", "", 7.5)
    for idx, r in enumerate(summary):
        fill_bg = idx % 2 == 0
        pdf.set_fill_color(*(_C_GOLD_LT if fill_bg else _C_WHITE))
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

        # Status badge — rounded pill (dashboard style)
        sx, sy = pdf.get_x(), pdf.get_y()
        pdf.cell(COL_W[7], ROW_H, "", border=1, fill=fill_bg)
        b = _STATUS_BADGE.get(r["status"], _BADGE_GREY)
        pdf.status_pill(sx, sy, COL_W[7], ROW_H, r["status"], b["fg"], b["bg"])
        pdf.set_xy(pdf.l_margin, sy + ROW_H)

    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*_C_MUTED)
    pdf.multi_cell(0, 4,
        "Catatan: kolom Peak = nilai MAX absolut (puncak sesaat). "
        "Weighted Score menggabungkan utilisasi (Avg + P95 + Peak, bobot 80%) dan kualitas "
        "jalur ukur (latency + packet loss, bobot 20%). Status juga bisa naik dari utilisasi "
        "murni bila link nyaris penuh - lihat 'Cara Menilai' di halaman awal. "
        "Alasan status tiap link dijelaskan di bagian 'Analisa Per Lokasi'.")
    pdf.ln(4)

    # ── Connection quality table (latency & packet loss) ──
    # Halaman baru supaya header + seluruh baris tabel tidak terpotong antar halaman
    if pdf.get_y() > 170:
        pdf.add_page()
    pdf.section_title("Kualitas Koneksi  -  Latency & Packet Loss")

    Q_W    = [52, 24, 24, 24, 21, 21, 24]   # sum = 190
    Q_HEAD = ["Host / ISP", "Lat Avg", "Lat P95", "Lat Max", "Loss Avg", "Loss Max", "Kualitas"]

    pdf.table_header(Q_W, Q_HEAD, HEAD_H)

    pdf.set_font("Helvetica", "", 7.5)
    for idx, r in enumerate(summary):
        fill_bg = idx % 2 == 0
        pdf.set_fill_color(*(_C_GOLD_LT if fill_bg else _C_WHITE))
        pdf.set_text_color(*_C_BODY)
        has_lat = r.get("latency_sample", 0) > 0
        lat_avg = f"{r['latency_avg_ms']:.1f} ms" if has_lat else "-"
        lat_p95 = f"{r['latency_p95_ms']:.1f} ms" if has_lat else "-"
        lat_max = f"{r['latency_max_ms']:.1f} ms" if has_lat else "-"
        loss_avg = f"{r['loss_avg_pct']:.1f}%" if has_lat else "-"
        loss_max = f"{r['loss_max_pct']:.1f}%" if has_lat else "-"

        q_label = r["label"] + ("  (via VPN)" if r.get("vpn_measured") else "")
        pdf.cell(Q_W[0], ROW_H, q_label, border=1, align="L", fill=fill_bg)
        pdf.cell(Q_W[1], ROW_H, lat_avg, border=1, align="R", fill=fill_bg)
        pdf.cell(Q_W[2], ROW_H, lat_p95, border=1, align="R", fill=fill_bg)
        pdf.cell(Q_W[3], ROW_H, lat_max, border=1, align="R", fill=fill_bg)
        pdf.cell(Q_W[4], ROW_H, loss_avg, border=1, align="R", fill=fill_bg)
        pdf.cell(Q_W[5], ROW_H, loss_max, border=1, align="R", fill=fill_bg)

        q = r.get("conn_quality", "-")
        qx, qy = pdf.get_x(), pdf.get_y()
        pdf.cell(Q_W[6], ROW_H, "", border=1, fill=fill_bg)
        qb = _QUALITY_BADGE.get(q, _BADGE_GREY)
        pdf.status_pill(qx, qy, Q_W[6], ROW_H, q, qb["fg"], qb["bg"])
        pdf.set_xy(pdf.l_margin, qy + ROW_H)

    pdf.ln(2)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*_C_MUTED)
    pdf.multi_cell(0, 4,
        "Kualitas: BAIK (P95 < 80 ms & loss < 0,5%)   CUKUP (P95 80-150 ms atau loss 0,5-2%)   "
        "BURUK (P95 >= 150 ms atau loss >= 2%).  Loss dihitung dari rata-rata periode, bukan nilai max. "
        "Tanda '-' = item ICMP ping tidak tersedia di Zabbix.  "
        "Server Zabbix berada di Duta Garden. Baris bertanda (via VPN) di-ping menembus tunnel VPN "
        "(uplink utama KS Tubun, cadangan Jatake), sehingga angkanya menggambarkan kesehatan VPN - "
        "bukan link ISP site tsb. Untuk baris ini bobot komponen kualitas dikecilkan 50% dan "
        "tidak dipakai menaikkan status.")
    pdf.ln(4)

    # ── Global analysis ───────────────────────
    pdf.section_title("Analisa Global")
    global_sum = build_global_summary(summary)
    # Link cadangan / CCTV dikeluarkan dari sorotan "skor terendah" - utilisasi
    # rendah memang wajar untuk link tsb, bukan indikasi masalah.
    _score_pool = [r for r in summary if not r.get("is_standby")] or summary
    low_score = min(_score_pool, key=lambda x: x["weighted_score"]) if _score_pool else None
    lines = []
    if global_sum["high_score"]:
        lines.append(f"  Weighted Score tertinggi  : {global_sum['high_score']['label']} ({global_sum['high_score']['weighted_score']}%)")
    if low_score:
        lines.append(f"  Weighted Score terendah   : {low_score['label']} ({low_score['weighted_score']}%)")
    if global_sum["high_avg"]:
        lines.append(f"  Rata-rata total tertinggi : {global_sum['high_avg']['label']} ({global_sum['high_avg']['avg']} Mbps)")
    if global_sum["high_peak_down"]:
        lines.append(f"  Peak Download tertinggi   : {global_sum['high_peak_down']['label']} ({global_sum['high_peak_down']['peak_download']} Mbps)")
    if global_sum["high_peak_up"]:
        lines.append(f"  Peak Upload tertinggi     : {global_sum['high_peak_up']['label']} ({global_sum['high_peak_up']['peak_upload']} Mbps)")
    if summary:
        _total_avg = round(sum(r["avg"] for r in summary), 1)
        _mean_score = round(statistics.mean([r["weighted_score"] for r in summary]), 1)
        lines.append(f"  Total rata-rata trafik seluruh lokasi : {_total_avg} Mbps")
        lines.append(f"  Rata-rata Weighted Score seluruh lokasi : {_mean_score}%")
    if dhcp_rows:
        _total_active = sum(d["active"] for d in dhcp_rows)
        _busiest = max(dhcp_rows, key=lambda d: d["active"])
        lines.append(f"  Total user aktif seluruh router : {_total_active} user")
        lines.append(f"  Router dengan user aktif terbanyak : {_busiest['router']} ({_busiest['active']} user)")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_C_BODY)
    for line in lines:
        pdf.cell(0, 6, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(4)

    # ── Active DHCP users per router ───────────
    pdf.section_title("Jumlah User Aktif (DHCP)")
    if not dhcp_rows:
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*_C_MUTED)
        pdf.multi_cell(0, 5,
            "Data DHCP tidak tersedia (router tidak dapat dijangkau saat laporan dibuat).")
        pdf.ln(3)
    else:
        # Urutkan dari user terbanyak supaya router tersibuk langsung terlihat di atas.
        dh_sorted = sorted(dhcp_rows, key=lambda d: d["active"], reverse=True)
        total_active = sum(d["active"] for d in dh_sorted) or 1

        # Router | User Aktif | % Total | Proporsi (mini bar) — sum = 190
        DH_W = [72, 30, 26, 62]
        DH_ROW_H = 8
        bar_pad, bar_h = 6, 3.6

        # Pastikan seluruh tabel (header + semua baris + baris TOTAL) muat di satu
        # halaman. Kalau tidak, pindah halaman dulu - supaya mini-bar Proporsi
        # (digambar dengan koordinat absolut) tidak nyasar akibat page-break di
        # tengah baris.
        pdf.ensure_space(DH_ROW_H * (len(dh_sorted) + 2) + 8)

        pdf.table_header(DH_W, ["Router", "User Aktif", "% Total", "Proporsi"], DH_ROW_H)

        # Matikan auto page-break selama menggambar body tabel; sudah dijamin muat.
        _saved_apb, _saved_bm = pdf.auto_page_break, pdf.b_margin
        pdf.set_auto_page_break(False)

        for i, d in enumerate(dh_sorted):
            is_top = i == 0 and d["active"] > 0
            fill_bg = i % 2 == 0
            bg = _C_GOLD_LT if fill_bg else _C_WHITE
            row_y = pdf.get_y()
            pct = d["active"] / total_active * 100

            pdf.set_fill_color(*bg)
            pdf.set_text_color(*(_C_NAVY if is_top else _C_BODY))
            pdf.set_font("Helvetica", "B" if is_top else "", 8)
            pdf.cell(DH_W[0], DH_ROW_H, d["router"], border=1, align="L", fill=fill_bg)
            pdf.cell(DH_W[1], DH_ROW_H, str(d["active"]), border=1, align="C", fill=fill_bg)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_C_BODY)
            pdf.cell(DH_W[2], DH_ROW_H, f"{pct:.1f}%", border=1, align="C", fill=fill_bg)

            # Proporsi cell — mini bar = porsi terhadap TOTAL (konsisten dgn kolom % Total)
            bar_x0 = pdf.get_x()
            pdf.cell(DH_W[3], DH_ROW_H, "", border=1, fill=fill_bg)
            track_w = DH_W[3] - bar_pad * 2
            bar_y = row_y + (DH_ROW_H - bar_h) / 2
            frac = pct / 100
            pdf.set_fill_color(226, 231, 238)
            pdf.rect(bar_x0 + bar_pad, bar_y, track_w, bar_h, style="F",
                     round_corners=True, corner_radius=bar_h / 2)
            if d["active"] > 0:
                pdf.set_fill_color(*(_C_ACCENT if is_top else _C_NAVY))
                pdf.rect(bar_x0 + bar_pad, bar_y, max(track_w * frac, bar_h), bar_h, style="F",
                         round_corners=True, corner_radius=bar_h / 2)
            pdf.set_xy(pdf.l_margin, row_y + DH_ROW_H)

        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*_C_NAVY)
        pdf.set_text_color(*_C_WHITE)
        pdf.cell(DH_W[0], DH_ROW_H, "TOTAL SELURUH ROUTER", border=1, align="L", fill=True)
        pdf.cell(DH_W[1], DH_ROW_H, str(sum(d["active"] for d in dh_sorted)), border=1, align="C", fill=True)
        pdf.cell(DH_W[2], DH_ROW_H, "100%", border=1, align="C", fill=True)
        pdf.cell(DH_W[3], DH_ROW_H, "", border=1, fill=True,
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_auto_page_break(_saved_apb, _saved_bm)

        pdf.ln(2)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(*_C_MUTED)
        pdf.multi_cell(0, 4,
            f"Snapshot DHCP lease berstatus 'bound' saat laporan dibuat "
            f"({end_dt.strftime('%d %b %Y %H:%M')}) - bukan rata-rata selama periode. "
            "Satu router bisa melayani lebih dari satu link ISP (beban dibagi antar ISP), "
            "jadi angka di sini per router, bukan per link.")
        pdf.ln(3)

    # ── Per-location analysis ─────────────────
    pdf.section_title("Analisa Per Lokasi")
    start_ts, end_ts = datetime_range_to_timestamps(start_dt, end_dt)

    # Laporan harian (rentang <= 36 jam) -> analisa per jam.
    # Laporan mingguan -> analisa per hari.
    is_daily_report = (end_dt - start_dt) <= datetime.timedelta(hours=36)

    for r in summary:
        label     = r["label"]
        host_name = ITEM_MAP.get(label, {}).get("host", "")
        recv_list = ITEM_MAP.get(label, {}).get("recv", [])
        sent_list = ITEM_MAP.get(label, {}).get("sent", [])
        capacity  = CAPACITY.get(label, 0) or 0

        if is_daily_report:
            hourly = get_hourly_usage_dual(host_name, recv_list, sent_list, start_ts, end_ts, capacity)
            daily = None
        else:
            daily = get_daily_usage_dual(host_name, recv_list, sent_list, start_ts, end_ts, capacity)
            hourly = None

        # Pastikan satu blok lokasi (label + narasi + rekomendasi) tidak terpotong page-break
        if pdf.get_y() + 34 > pdf.page_break_trigger:
            pdf.add_page()

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

        buckets = hourly if is_daily_report else daily
        if not buckets:
            pdf.cell(0, 5, "Data trafik tidak tersedia untuk lokasi ini.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)
            continue

        if is_daily_report:
            busy_h = max(buckets.keys(), key=lambda h: buckets[h]["total"])
            quiet_h = min(buckets.keys(), key=lambda h: buckets[h]["total"])
            text = (
                f"Score: {r['weighted_score']}%  |  Status: {r['status']} - "
                f"dipicu oleh {r['status_reason']}.  "
                f"Jam tersibuk sekitar pukul {busy_h:02d}:00-{(busy_h + 1) % 24:02d}:00 "
                f"dengan rata-rata total {buckets[busy_h]['total']} Mbps "
                f"(Download: {buckets[busy_h]['download']} Mbps, Upload: {buckets[busy_h]['upload']} Mbps). "
                f"Paling sepi sekitar pukul {quiet_h:02d}:00-{(quiet_h + 1) % 24:02d}:00 "
                f"dengan total {buckets[quiet_h]['total']} Mbps."
            )
        else:
            high_date = max(buckets.keys(), key=lambda d: buckets[d]["total"])
            low_date  = min(buckets.keys(), key=lambda d: buckets[d]["total"])
            text = (
                f"Score: {r['weighted_score']}%  |  Status: {r['status']} - "
                f"dipicu oleh {r['status_reason']}.  "
                f"Puncak harian rata-rata tertinggi pada {format_date_ind(high_date)} "
                f"dengan total {buckets[high_date]['total']} Mbps "
                f"(Download: {buckets[high_date]['download']} Mbps, Upload: {buckets[high_date]['upload']} Mbps). "
                f"Terendah pada {format_date_ind(low_date)} dengan total {buckets[low_date]['total']} Mbps."
            )
        pdf.multi_cell(180, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        users = match_dhcp_active(label, dhcp_rows)
        if users:
            pdf.set_x(15)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*_C_NAVY)
            pdf.cell(0, 5, f"User aktif (DHCP): {users} user",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            dens = classify_user_density(capacity, users)
            if dens:
                d_lab, d_per = dens
                d_col = {"PADAT": (176, 35, 24), "SEDANG": (138, 104, 15),
                         "LONGGAR": (24, 120, 110)}[d_lab]
                if d_lab == "PADAT" and r["status"] in ("PADAT", "TINGGI"):
                    tip = "  ->  bandwidth & user sama-sama padat, prioritaskan upgrade kapasitas."
                elif d_lab == "PADAT":
                    tip = "  ->  user padat walau trafik belum penuh; siapkan rencana kapasitas / QoS."
                else:
                    tip = ""
                pdf.set_x(15)
                pdf.set_font("Helvetica", "B", 8)
                pdf.set_text_color(*d_col)
                pdf.multi_cell(180, 5,
                    f"Kepadatan user: {d_lab}  (~{d_per:.1f} Mbps kapasitas per user){tip}",
                    new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_C_BODY)

        if r.get("quality_note"):
            pdf.set_x(15)
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.set_text_color(180, 35, 24)
            pdf.cell(0, 5, f"Catatan status: {r['quality_note']}.",
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_C_BODY)

        if r.get("standby_note"):
            pdf.set_x(15)
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.set_text_color(24, 120, 110)
            pdf.multi_cell(180, 5, r["standby_note"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_C_BODY)

        if r.get("latency_sample", 0):
            pdf.set_x(15)
            _via = " (via VPN - ukur kesehatan tunnel, bukan link ISP)" if r.get("vpn_measured") else ""
            lat_text = (
                f"Latency{_via}: rata-rata {r['latency_avg_ms']:.1f} ms, P95 {r['latency_p95_ms']:.1f} ms, "
                f"max {r['latency_max_ms']:.1f} ms  |  Packet loss: rata-rata {r['loss_avg_pct']:.1f}%, "
                f"max {r['loss_max_pct']:.1f}%  ->  Kualitas {r.get('conn_quality', '-')}."
            )
            pdf.multi_cell(180, 5, lat_text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_x(15)
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(*_C_MUTED)
        pdf.cell(0, 5, f"Rekomendasi: {r['solusi']}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(3)

    # ── Charts (lanjut di halaman berjalan kalau ruang cukup, tidak selalu ganti halaman) ──
    def img_height_mm(path: str, width_mm: float) -> float:
        with PILImage.open(path) as im:
            w_px, h_px = im.size
        return h_px / w_px * width_mm

    if os.path.exists(HISTORY_CHART_PATH):
        h = img_height_mm(HISTORY_CHART_PATH, 190)
        pdf.ensure_space(h + 14)
        pdf.section_title("Tren Trafik Bandwidth per Lokasi")
        pdf.image(HISTORY_CHART_PATH, x=10, w=190)

    if os.path.exists(LATENCY_CHART_PATH):
        h = img_height_mm(LATENCY_CHART_PATH, 190)
        pdf.ensure_space(h + 14)
        pdf.section_title("Tren Latency per Lokasi")
        pdf.image(LATENCY_CHART_PATH, x=10, w=190)

    if os.path.exists(CHART_PATH):
        h = img_height_mm(CHART_PATH, 190)
        pdf.ensure_space(h + 14)
        pdf.section_title("Grafik Trafik  -  Download vs Upload")
        pdf.image(CHART_PATH, x=10, w=190)

    if os.path.exists(PIE_PATH):
        h = img_height_mm(PIE_PATH, 170)
        pdf.ensure_space(h + 14)
        pdf.section_title("Distribusi Pemakaian Bandwidth")
        pdf.image(PIE_PATH, x=20, w=170)

    pdf.output(output_path)
    return dhcp_rows


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

    # Palet selaras dashboard: Download = teal, Upload = coral
    # Avg = warna penuh (solid), Peak = warna sama lebih muda + garis tepi warna penuh
    C_DL, C_UL       = "#1f8f81", "#e15a3c"
    C_DL_LT, C_UL_LT = "#7cc6bd", "#f0a189"

    fig, ax = plt.subplots(figsize=(16, 7.5))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    b1 = ax.bar(x - 1.5*w, download_avg,  w, label="Avg Download",  color=C_DL,    zorder=3, linewidth=0)
    b2 = ax.bar(x - 0.5*w, upload_avg,    w, label="Avg Upload",    color=C_UL,    zorder=3, linewidth=0)
    b3 = ax.bar(x + 0.5*w, download_peak, w, label="Peak Download", color=C_DL_LT, zorder=3,
                linewidth=1.1, edgecolor=C_DL)
    b4 = ax.bar(x + 1.5*w, upload_peak,   w, label="Peak Upload",   color=C_UL_LT, zorder=3,
                linewidth=1.1, edgecolor=C_UL)

    for bars in (b1, b2, b3, b4):
        ax.bar_label(bars, fmt="%.0f", padding=2, fontsize=7.2,
                     color="#374151", fontweight="bold")

    for i, cap in enumerate(capacities):
        ax.hlines(cap, i - 2.1*w, i + 2.1*w, colors="#9ca3af",
                  linewidths=1.0, linestyles=(0, (4, 3)), zorder=4)
        ax.text(i + 2.25*w, cap, f"{cap}M", va="center", ha="left",
                fontsize=6.3, color="#9ca3af")

    ax.grid(axis="y", color="#eef1f5", linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.set_xticks(x)
    ax.set_xticklabels(labels_short, color="#1f2937", fontsize=9, fontweight="bold")
    ax.set_ylabel("Bandwidth (Mbps)", color="#4b5563", fontsize=10)
    ax.tick_params(colors="#6b7280", which="both", labelsize=9)
    ax.margins(y=0.20)

    cap_line = Line2D([0], [0], color="#9ca3af", linewidth=1.0,
                      linestyle=(0, (4, 3)), label="Kapasitas")
    ax.legend(handles=[b1, b2, b3, b4, cap_line], loc="upper right", ncol=5,
              frameon=False, labelcolor="#1f2937", fontsize=10.5,
              handlelength=1.4, columnspacing=1.6, handletextpad=0.6)

    fig.suptitle("Trafik Download vs Upload  -  Rata-rata & Puncak", color="#1f2937",
                 fontsize=14, fontweight="bold", y=0.99)
    ax.set_title("Bar penuh = rata-rata (Avg)   -   bar muda bergaris = puncak (Peak)   -   garis abu putus-putus = kapasitas link",
                 color="#6b7280", fontsize=8.5, pad=10)

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

    # Palet selaras dengan dashboard (navy / teal / coral / gold / purple ...)
    palette = [
        "#1a2a57", "#2a9d8f", "#e9c46a", "#e76f51",
        "#9d4edd", "#2d4a8c", "#23857a", "#c77b3f",
    ]
    colors = [palette[i % len(palette)] for i in range(len(summary))]

    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    wedge_props = dict(width=0.36, edgecolor="#ffffff", linewidth=2.5)
    wedges, _texts, autotexts = ax.pie(
        vals,
        labels=None,
        autopct=lambda pct: f"{pct:.0f}%" if pct > 4 else "",
        pctdistance=0.82,
        colors=colors,
        startangle=90,
        wedgeprops=wedge_props,
    )

    def _lum(hex_c):
        r, g, b = (int(hex_c[i:i + 2], 16) / 255 for i in (1, 3, 5))
        return 0.299 * r + 0.587 * g + 0.114 * b

    for at, c in zip(autotexts, colors):
        at.set_color("#1f2937" if _lum(c) > 0.62 else "#ffffff")
        at.set_fontsize(11.5)
        at.set_fontweight("bold")

    ax.text(0,  0.12, f"{total:.1f}",        ha="center", va="center", fontsize=26, fontweight="bold", color="#1f2937")
    ax.text(0, -0.13, "Mbps",                ha="center", va="center", fontsize=11, color="#6b7280", fontweight="bold")
    ax.text(0, -0.32, "rata-rata bandwidth", ha="center", va="center", fontsize=8,  color="#9ca3af")

    legend_labels = [
        f"{labels[i]}\n{vals[i]:.1f} Mbps  ·  {vals[i] / total * 100:.0f}%"
        for i in range(len(summary))
    ]
    leg = ax.legend(
        wedges, legend_labels, title="HOST / ISP",
        loc="center left", bbox_to_anchor=(0.98, 0.5),
        frameon=True, framealpha=1, facecolor="#ffffff", edgecolor="#e5e7eb",
        labelcolor="#1f2937", fontsize=11, title_fontsize=10,
        handlelength=1.1, handleheight=1.1, handletextpad=1.0,
        borderpad=1.3, labelspacing=1.4,
    )
    leg.get_title().set_color("#6b7280")
    leg.get_title().set_fontweight("bold")

    ax.set_title("Distribusi Rata-rata Bandwidth per Host / ISP",
                 color="#1f2937", fontsize=13, fontweight="bold", pad=16)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()


# ─────────────────────────────────────────────
#  HISTORY  —  Tren trafik bandwidth per lokasi
# ─────────────────────────────────────────────

def _small_multiple_grid(n: int) -> Tuple[int, int]:
    cols = 1 if n <= 1 else 2
    rows = math.ceil(n / cols)
    return rows, cols


def make_history_chart(
    start_dt: datetime.datetime,
    end_dt: datetime.datetime,
    output_path: str = HISTORY_CHART_PATH,
) -> bool:
    import matplotlib.dates as mdates
    from collections import OrderedDict

    points = build_history_chart_all(start_dt, end_dt)
    if not points:
        return False

    by_host: "OrderedDict[str, List[Dict]]" = OrderedDict()
    for p in points:
        by_host.setdefault(p["host"], []).append(p)

    hosts = list(by_host.keys())
    rows, cols = _small_multiple_grid(len(hosts))

    fig, axes = plt.subplots(rows, cols, figsize=(16, 3.1 * rows), squeeze=False)
    fig.patch.set_facecolor("#ffffff")

    for idx, host in enumerate(hosts):
        ax = axes[idx // cols][idx % cols]
        series = by_host[host]
        times = [datetime.datetime.strptime(s["time"], "%Y-%m-%d %H:%M:%S") for s in series]
        dl = [s["download"] for s in series]
        ul = [s["upload"] for s in series]

        ax.fill_between(times, dl, color="#0b0b60", alpha=0.10, zorder=1)
        ax.plot(times, dl, color="#0b0b60", linewidth=1.4, label="Download", zorder=3)
        ax.plot(times, ul, color="#e39618", linewidth=1.4, label="Upload", zorder=3)

        cap = CAPACITY.get(host, 0) or 0
        if cap:
            ax.axhline(cap, color="#ef4444", linestyle="--", linewidth=0.9, zorder=2)
            ax.text(times[-1] if times else 0, cap, f" {cap}M", va="center",
                    fontsize=6.5, color="#ef4444")

        ax.set_title(host.replace("Mikrotik ", ""), fontsize=9.5, fontweight="bold",
                     color="#0b0b60", pad=6)
        ax.grid(color="#e2e8f0", linewidth=0.5, zorder=0)
        ax.set_axisbelow(True)
        ax.tick_params(labelsize=6, colors="#64748b")
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m\n%H:%M"))
        ax.margins(x=0.02)

    for j in range(len(hosts), rows * cols):
        axes[j // cols][j % cols].axis("off")

    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper right", fontsize=9, framealpha=0.9,
               edgecolor="#e2e8f0")
    fig.suptitle("Tren Trafik Bandwidth per Lokasi (Mbps)", fontsize=14,
                 fontweight="bold", color="#0b0b60", y=0.995)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    plt.savefig(output_path, dpi=150, bbox_inches="tight", facecolor="#ffffff")
    plt.close()
    return True


def make_latency_chart(
    start_dt: datetime.datetime,
    end_dt: datetime.datetime,
    output_path: str = LATENCY_CHART_PATH,
) -> bool:
    import matplotlib.dates as mdates

    series_by_host = build_latency_history_all(start_dt, end_dt)
    if not series_by_host:
        return False

    hosts = list(series_by_host.keys())
    rows, cols = _small_multiple_grid(len(hosts))

    fig, axes = plt.subplots(rows, cols, figsize=(16, 2.9 * rows), squeeze=False)
    fig.patch.set_facecolor("#ffffff")

    for idx, host in enumerate(hosts):
        ax = axes[idx // cols][idx % cols]
        series = series_by_host[host]
        times = [datetime.datetime.strptime(s["time"], "%Y-%m-%d %H:%M:%S") for s in series]
        avg = [s["latency"] for s in series]
        mx = [s.get("latency_max", s["latency"]) for s in series]

        ax.fill_between(times, avg, color="#2a9d8f", alpha=0.12, zorder=1)
        ax.plot(times, mx, color="#e76f51", linewidth=0.9, alpha=0.6,
                label="Max", zorder=2)
        ax.plot(times, avg, color="#0b6e63", linewidth=1.5, label="Rata-rata", zorder=3)

        peak = max(mx) if mx else 0
        ax.set_title(f"{host.replace('Mikrotik ', '')}   ·   avg "
                     f"{round(statistics.mean(avg), 1) if avg else 0} ms / max {round(peak, 1)} ms",
                     fontsize=9, fontweight="bold", color="#0b0b60", pad=6)
        ax.grid(color="#e2e8f0", linewidth=0.5, zorder=0)
        ax.set_axisbelow(True)
        ax.tick_params(labelsize=6, colors="#64748b")
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m\n%H:%M"))
        ax.margins(x=0.02)

    for j in range(len(hosts), rows * cols):
        axes[j // cols][j % cols].axis("off")

    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper right", fontsize=9, framealpha=0.9,
               edgecolor="#e2e8f0")
    fig.suptitle("Tren Latency (ICMP Response Time) per Lokasi", fontsize=14,
                 fontweight="bold", color="#0b0b60", y=0.995)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    plt.savefig(output_path, dpi=150, bbox_inches="tight", facecolor="#ffffff")
    plt.close()
    return True


def regenerate_report_assets(
    summary: List[Dict], start_dt: datetime.datetime, end_dt: datetime.datetime
) -> None:
    """Buat ulang semua gambar chart untuk PDF. Hapus dulu yang lama supaya
    tidak ada gambar basi yang ikut ke-embed kalau salah satu chart gagal dibuat."""
    for path in (CHART_PATH, PIE_PATH, HISTORY_CHART_PATH, LATENCY_CHART_PATH):
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass

    for name, fn in (
        ("bar chart", lambda: make_chart(summary, CHART_PATH)),
        ("pie chart", lambda: make_pie(summary, PIE_PATH)),
        ("history chart", lambda: make_history_chart(start_dt, end_dt, HISTORY_CHART_PATH)),
        ("latency chart", lambda: make_latency_chart(start_dt, end_dt, LATENCY_CHART_PATH)),
    ):
        try:
            fn()
        except Exception:
            logging.exception("Gagal membuat %s untuk laporan", name)


def send_email(
    summary: List[Dict],
    start_dt: datetime.datetime,
    end_dt: datetime.datetime,
    report_path: str = REPORT_PATH,
    dhcp_rows: Optional[List[Dict]] = None,
):
    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = ", ".join(TO_EMAIL)
    msg["Subject"] = f"Laporan Trafik - PT Pilar Niaga Makmur ({end_dt.strftime('%d/%m/%Y %H:%M')})"

    status_count = build_status_count(summary)
    total_hosts  = len(summary)
    generated_at = end_dt.strftime("%d %B %Y, %H:%M")
    periode_str  = f"{start_dt.strftime('%d %b %Y %H:%M')} - {end_dt.strftime('%d %b %Y %H:%M')}"

    if dhcp_rows is None:
        dhcp_rows = build_dhcp_active_summary()
    total_active = sum(d.get("active", 0) for d in dhcp_rows) if dhcp_rows else 0
    busiest_user = max(dhcp_rows, key=lambda d: d.get("active", 0)) if dhcp_rows else None

    rows_html = ""
    for r in summary:
        sc_map = {"TINGGI": "#dc3545", "PADAT": "#fd7e14", "STABIL": "#20b264"}
        sc = sc_map.get(r["status"], "#6c757d")
        _tag = ""
        if r.get("vpn_measured"):
            _tag += " <span style='font-size:9px;font-weight:700;color:#64748b;border:1px solid #cbd5e1;border-radius:3px;padding:0 3px;'>VPN</span>"
        if r.get("is_standby"):
            _tag += " <span style='font-size:9px;font-weight:700;color:#18786e;border:1px solid #9ecfc8;border-radius:3px;padding:0 3px;'>CADANGAN</span>"
        rows_html += (
            "<tr style='border-bottom:1px solid #f0f0f0;'>"
            f"<td style='padding:9px 12px;font-size:12px;color:#1e293b;'>{r['label']}{_tag}</td>"
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

    # Link yang perlu perhatian (PADAT / TINGGI) - untuk narasi ringkas
    _attention = [r["label"] for r in summary if r["status"] in ("PADAT", "TINGGI")]
    if _attention:
        attention_txt = (
            "Link yang perlu perhatian: "
            f"<strong style='color:#c0271c;'>{', '.join(_attention)}</strong>. "
            "Rincian penyebab per link ada di lampiran PDF."
        )
    else:
        attention_txt = (
            "<strong style='color:#1a8f4c;'>Semua link dalam kondisi stabil</strong> "
            "sepanjang periode ini."
        )

    # ── Status distribution bar (segmented) + legend ──
    _C_STABIL, _C_PADAT, _C_TINGGI = "#1a8f4c", "#c96a10", "#c0271c"
    _seg_parts = [stabil_c, padat_c, tinggi_c]
    _seg_tot = sum(_seg_parts) or 1
    _seg_w = [int(round(p / _seg_tot * 100)) for p in _seg_parts]
    if any(_seg_w):
        _seg_w[max(range(3), key=lambda i: _seg_parts[i])] += 100 - sum(_seg_w)

    _bar_cells = ""
    for _w, _col in zip(_seg_w, (_C_STABIL, _C_PADAT, _C_TINGGI)):
        if _w > 0:
            _bar_cells += (
                f"<td width='{_w}%' height='14' style='background:{_col};height:14px;"
                "line-height:14px;font-size:1px;mso-line-height-rule:exactly;'>&#8203;</td>"
            )
    if not _bar_cells:
        _bar_cells = (
            "<td height='14' style='background:#e2e8f0;height:14px;line-height:14px;"
            "font-size:1px;mso-line-height-rule:exactly;'>&#8203;</td>"
        )

    def _legend_item(count, label, col):
        return (
            "<td style='padding:0 16px 0 0;font-size:12px;color:#334155;white-space:nowrap;'>"
            f"<span style='color:{col};font-size:14px;'>&#9679;</span>&nbsp;"
            f"<strong style='color:#0f2044;'>{count}</strong> {label}</td>"
        )

    _user_strip = ""
    if total_active:
        _bu = ""
        if busiest_user and busiest_user.get("active"):
            _bu = (
                f" &nbsp;&middot;&nbsp; terpadat: <strong>{busiest_user['router']}</strong> "
                f"({busiest_user['active']} user)"
            )
        _user_strip = (
            "<div style='margin:14px 0 0;background:#f1f5f9;border-radius:6px;"
            "padding:10px 14px;font-size:11.5px;color:#475569;'>"
            f"<strong style='color:#0f2044;font-size:12.5px;'>{total_active}</strong> "
            f"user aktif (DHCP lease 'bound', snapshot saat laporan dibuat){_bu}</div>"
        )

    cards_html = (
        "<div style='border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:0 0 18px;'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;"
        f"color:#64748b;margin:0 0 8px;'>Distribusi Status &nbsp;&middot;&nbsp; {total_hosts} host/ISP</div>"
        "<div style='border-radius:4px;overflow:hidden;'>"
        "<table width='100%' cellpadding='0' cellspacing='0' border='0' "
        "style='border-collapse:collapse;border-spacing:0;width:100%;'><tr>"
        f"{_bar_cells}"
        "</tr></table></div>"
        "<table cellpadding='0' cellspacing='0' border='0' style='margin:10px 0 0;border-collapse:collapse;'><tr>"
        + _legend_item(stabil_c, "Stabil", _C_STABIL)
        + _legend_item(padat_c, "Padat", _C_PADAT)
        + _legend_item(tinggi_c, "Tinggi", _C_TINGGI)
        + "</tr></table>"
        f"{_user_strip}"
        "</div>"
    )

    # ── CTA: buka dashboard NOC realtime untuk detail lebih lanjut ──
    _noc_cta_html = ""
    if NOC_PUBLIC_URL:
        _noc_link = f"{NOC_PUBLIC_URL}/noc"
        _noc_cta_html = (
            "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:14px;"
            "background:#f1f5f9;border-left:4px solid #1a2a57;border-radius:4px;'><tr>"
            "<td style='padding:16px 18px;'>"
            "<p style='margin:0 0 4px;font-size:12px;color:#1a2a57;font-weight:600;'>"
            "Ingin lihat kondisi terkini?</p>"
            "<p style='margin:0 0 12px;font-size:11px;color:#475569;line-height:1.6;'>"
            "Laporan ini merangkum periode di atas. Untuk status <strong>realtime</strong> "
            "(site up/down, perangkat MikroTik, insiden berjalan, jumlah user) yang diperbarui "
            "otomatis tiap 15 detik, buka dashboard NOC.</p>"
            f"<a href='{_noc_link}' style='display:inline-block;background:#1a2a57;color:#ffffff;"
            "text-decoration:none;padding:9px 18px;border-radius:6px;font-size:12px;font-weight:700;'>"
            "Buka Dashboard NOC &rarr;</a>"
            f"<p style='margin:10px 0 0;font-size:10.5px;color:#94a3b8;'>Atau salin: "
            f"<a href='{_noc_link}' style='color:#2d4a8c;'>{_noc_link}</a></p>"
            "</td></tr></table>"
        )

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
        # Executive summary — stat cards + narrative
        "<p style='margin:0 0 12px;font-size:13px;font-weight:600;color:#0f2044;"
        "letter-spacing:0.3px;text-transform:uppercase;'>Ringkasan Eksekutif</p>"
        f"{cards_html}"
        f"<p style='margin:0 0 24px;font-size:12.5px;color:#334155;line-height:1.7;'>"
        f"{attention_txt}</p>"
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
        "Weighted Score (0-100) = (80% x Utilisasi) + (20% x Kualitas Jalur Ukur). "
        "Utilisasi = (0.50 x Avg%) + (0.35 x P95%) + (0.15 x Peak%) terhadap kapasitas link. "
        "Status: STABIL &lt; 60; PADAT 60-79 atau utilisasi &ge; 70%; TINGGI &ge; 80 atau utilisasi &ge; 90%. "
        "Latency &amp; packet loss diukur dari server Zabbix (di Duta Garden) ke router. "
        "Baris <strong>VPN</strong> = diukur menembus tunnel VPN (uplink KS Tubun / Jatake), "
        "jadi mencerminkan kesehatan VPN - bukan link ISP; bobot kualitasnya dikecilkan 50%. "
        "Baris <strong>CADANGAN</strong> = link remote CCTV / cadangan, utilisasi rendah adalah normal.</p>"
        # Attachment note
        "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:24px;"
        "background:#f0f7ff;border-left:4px solid #0072ce;border-radius:4px;'><tr>"
        "<td style='padding:14px 18px;'>"
        "<p style='margin:0;font-size:12px;color:#1e3a5f;font-weight:600;'>"
        "Laporan lengkap tersedia dalam lampiran PDF.</p>"
        "<p style='margin:4px 0 0;font-size:11px;color:#475569;'>"
        "File PDF memuat grafik trafik, distribusi bandwidth, dan analisa detail per lokasi.</p>"
        "</td></tr></table>"
        # NOC realtime CTA
        f"{_noc_cta_html}"
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
        avg_component  = round(0.50 * r["max_avg_pct"], 1)
        p95_component  = round(0.35 * r["max_peak_pct"], 1)
        peak_component = round(0.15 * min(r.get("max_peakraw_pct", 0.0), 120.0), 1)
        util_component     = round(0.80 * r.get("util_score", 0.0), 1)
        # Pakai kontribusi kualitas yang sebenarnya (sudah dikecilkan untuk link via VPN)
        quality_component  = round(
            r.get("quality_contribution", 0.20 * r.get("quality_penalty", 0.0)), 1
        )
        result.append({
            "label": r["label"],
            "weighted_score": r["weighted_score"],
            "max_avg_pct": r["max_avg_pct"],
            "max_peak_pct": r["max_peak_pct"],
            "max_peakraw_pct": r.get("max_peakraw_pct", 0.0),
            "avg_component": avg_component,
            "p95_component": p95_component,
            "peak_component": peak_component,
            "util_score": r.get("util_score", 0.0),
            "util_component": util_component,
            "latency_penalty": r.get("latency_penalty", 0.0),
            "loss_penalty": r.get("loss_penalty", 0.0),
            "quality_penalty": r.get("quality_penalty", 0.0),
            "quality_component": quality_component,
            "status": r["status"],
            "status_reason": r.get("status_reason", ""),
            "vpn_measured": r.get("vpn_measured", False),
            "is_standby": r.get("is_standby", False),
            "standby_note": r.get("standby_note", ""),
        })
    return result


# ─────────────────────────────────────────────
#  NOC LIVE VIEW  (wallboard)
#  Status "sekarang" per site + daftar problem aktif dari Zabbix.
# ─────────────────────────────────────────────

NOC_CACHE: Dict[str, Tuple[datetime.datetime, Dict]] = {}
NOC_CACHE_TTL_SECONDS = 15

ZBX_SEVERITY_LABEL = {
    0: "Not classified", 1: "Information", 2: "Warning",
    3: "Average", 4: "High", 5: "Disaster",
}


def _noc_latest_for_names(by_name: Dict[str, Dict], names: List[str]) -> Optional[float]:
    for n in names:
        it = by_name.get(normalize_text(n))
        if it and str(it.get("lastvalue", "")).strip() not in ("", "None"):
            try:
                return float(it["lastvalue"])
            except (TypeError, ValueError):
                continue
    return None


def _noc_site_snapshot(label: str, cfg: Dict) -> Dict:
    host_name = cfg.get("host", "").strip()
    cap = CAPACITY.get(label, 0) or 0
    vpn_measured = is_vpn_measured(label)
    standby_note = STANDBY_LABELS.get(label, "")

    snap = {
        "label": label,
        "host": host_name,
        "capacity": cap,
        "vpn_measured": vpn_measured,
        "is_standby": bool(standby_note),
        "standby_note": standby_note,
        "up": None,
        "latency_ms": None,
        "loss_pct": None,
        "quality": "-",
        "in_mbps": None,
        "out_mbps": None,
        "util_pct": None,
        "state": "UNKNOWN",
        "last_seen": None,
    }

    hostid = find_hostid(host_name)
    if not hostid:
        return snap

    items = zabbix_request("item.get", {
        "output": ["name", "key_", "lastvalue", "lastclock"],
        "hostids": [hostid],
        "limit": 3000,
    })
    if not items:
        return snap

    by_key: Dict[str, Dict] = {}
    by_name: Dict[str, Dict] = {}
    last_clock = 0
    for it in items:
        by_key.setdefault(it.get("key_", "").split("[")[0], it)
        by_name[normalize_text(it.get("name", ""))] = it
        try:
            last_clock = max(last_clock, int(it.get("lastclock") or 0))
        except (TypeError, ValueError):
            pass

    if last_clock:
        snap["last_seen"] = datetime.datetime.fromtimestamp(last_clock).strftime("%Y-%m-%d %H:%M:%S")

    def _fval(key_base: str) -> Optional[float]:
        it = by_key.get(key_base)
        if not it or str(it.get("lastvalue", "")).strip() in ("", "None"):
            return None
        try:
            return float(it["lastvalue"])
        except (TypeError, ValueError):
            return None

    up = _fval("icmpping")
    loss = _fval("icmppingloss")
    lat = _fval("icmppingsec")

    snap["up"] = None if up is None else bool(up)
    snap["loss_pct"] = None if loss is None else round(loss, 1)
    snap["latency_ms"] = None if lat is None else round(lat * 1000.0, 1)

    recv = _noc_latest_for_names(by_name, cfg.get("recv", []))
    sent = _noc_latest_for_names(by_name, cfg.get("sent", []))
    if recv is not None:
        snap["in_mbps"] = round(recv / 1_000_000, 1)
    if sent is not None:
        snap["out_mbps"] = round(sent / 1_000_000, 1)

    if cap and (snap["in_mbps"] is not None or snap["out_mbps"] is not None):
        snap["util_pct"] = round(
            max(snap["in_mbps"] or 0.0, snap["out_mbps"] or 0.0) / cap * 100, 1
        )

    # Kualitas link instan (ambang sama dgn classify_connection_quality)
    if lat is not None or loss is not None:
        lm = snap["latency_ms"] or 0.0
        lp = snap["loss_pct"] or 0.0
        if lp >= 2.0 or lm >= 150:
            snap["quality"] = "BURUK"
        elif lp >= 0.5 or lm >= 80:
            snap["quality"] = "CUKUP"
        else:
            snap["quality"] = "BAIK"

    # State untuk wallboard
    if snap["up"] is False:
        snap["state"] = "DOWN"
    elif up is None and lat is None and snap["util_pct"] is None:
        snap["state"] = "UNKNOWN"
    elif (snap["util_pct"] is not None and snap["util_pct"] >= 85) or \
         (not vpn_measured and snap["quality"] == "BURUK") or \
         (not vpn_measured and (snap["loss_pct"] or 0) >= 2):
        snap["state"] = "WARN"
    else:
        snap["state"] = "UP"

    return snap


def _noc_problems() -> List[Dict]:
    probs = zabbix_request("problem.get", {
        "output": ["eventid", "name", "severity", "clock", "acknowledged", "objectid"],
        "sortfield": ["eventid"],
        "sortorder": "DESC",
        "limit": 100,
    })
    if not probs:
        return []

    trigger_ids = list({p.get("objectid") for p in probs if p.get("objectid")})
    host_by_trigger: Dict[str, str] = {}
    if trigger_ids:
        trigs = zabbix_request("trigger.get", {
            "triggerids": trigger_ids,
            "output": ["triggerid"],
            "selectHosts": ["host", "name"],
        })
        for t in trigs or []:
            hosts = t.get("hosts") or []
            if hosts:
                host_by_trigger[t["triggerid"]] = hosts[0].get("name") or hosts[0].get("host", "")

    now_ts = datetime.datetime.now().timestamp()
    out = []
    for p in probs:
        try:
            clock = int(p.get("clock") or 0)
        except (TypeError, ValueError):
            clock = 0
        sev = int(p.get("severity") or 0)
        out.append({
            "eventid": p.get("eventid"),
            "name": p.get("name", ""),
            "severity": sev,
            "severity_label": ZBX_SEVERITY_LABEL.get(sev, str(sev)),
            "host": host_by_trigger.get(p.get("objectid"), "-"),
            "acknowledged": str(p.get("acknowledged")) == "1",
            "since": datetime.datetime.fromtimestamp(clock).strftime("%Y-%m-%d %H:%M:%S") if clock else None,
            "age_seconds": int(now_ts - clock) if clock else None,
        })

    out.sort(key=lambda x: (-x["severity"], -(x["age_seconds"] or 0)))
    return out


# Router tempat daftar perangkat Netwatch. Default "0" = baca dari SEMUA MikroTik
# (tiap site punya Netwatch untuk perangkat lokalnya). Isi id tertentu untuk membatasi.
try:
    NOC_NETWATCH_ROUTER_ID = int(os.getenv("NOC_NETWATCH_ROUTER_ID", "0"))
except (TypeError, ValueError):
    NOC_NETWATCH_ROUTER_ID = 0

# Timeout koneksi per router khusus NOC (detik) — pendek supaya refresh tetap cepat
# walau ada site yang VPN-nya sedang mati.
try:
    NOC_NETWATCH_TIMEOUT = int(os.getenv("NOC_NETWATCH_TIMEOUT", "4"))
except (TypeError, ValueError):
    NOC_NETWATCH_TIMEOUT = 4


def _noc_devices() -> List[Dict]:
    """Perangkat (mis. access point) dari /tool/netwatch di router MikroTik."""
    try:
        rid = NOC_NETWATCH_ROUTER_ID or None
        rows = get_netwatch(router_id=rid, timeout=NOC_NETWATCH_TIMEOUT)
    except Exception:
        traceback.print_exc()
        return []

    out = []
    for r in rows:
        status = (r.get("status") or "unknown").lower()
        state = "UP" if status == "up" else "DOWN" if status == "down" else "UNKNOWN"
        out.append({
            "name": r.get("name") or r.get("host") or "-",
            "host": r.get("host"),
            "comment": r.get("comment"),
            "dhcp_name": r.get("dhcp_name"),
            "router_name": r.get("router_name"),
            "status": status,
            "state": state,
            "latency_ms": r.get("latency_ms"),
            "loss_pct": r.get("loss_pct"),
            "since": r.get("since"),
        })
    out.sort(key=lambda x: (0 if x["state"] == "DOWN" else 1 if x["state"] == "UNKNOWN" else 2,
                            (x["name"] or "").lower()))
    return out


_NOC_CLIENTS_CACHE: Dict[str, Tuple[datetime.datetime, Dict]] = {}
_NOC_CLIENTS_TTL = 60  # jumlah klien nggak perlu se-real-time status; hemat koneksi


def _noc_client_counts() -> Dict[str, Optional[int]]:
    """{router_name: jumlah klien DHCP}. Di-cache 60s & timeout pendek supaya
    nggak memperlambat refresh NOC."""
    cached = get_cache_value(_NOC_CLIENTS_CACHE, "clients")
    if cached is not None:
        return cached
    try:
        counts = get_client_counts(timeout=NOC_NETWATCH_TIMEOUT)
    except Exception:
        traceback.print_exc()
        counts = {}
    return set_cache_value(_NOC_CLIENTS_CACHE, "clients", counts, _NOC_CLIENTS_TTL)


def build_noc_live() -> Dict:
    sites = [_noc_site_snapshot(label, cfg) for label, cfg in ITEM_MAP.items()]
    counts = {"total": len(sites), "up": 0, "warn": 0, "down": 0, "unknown": 0}
    for s in sites:
        counts[s["state"].lower()] = counts.get(s["state"].lower(), 0) + 1

    devices = _noc_devices()
    device_counts = {
        "total": len(devices),
        "up": sum(1 for d in devices if d["state"] == "UP"),
        "down": sum(1 for d in devices if d["state"] == "DOWN"),
        "unknown": sum(1 for d in devices if d["state"] == "UNKNOWN"),
    }

    problems = _noc_problems()
    clients = _noc_client_counts()
    return {
        "success": True,
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "counts": counts,
        "sites": sites,
        "devices": devices,
        "device_counts": device_counts,
        "clients": clients,
        "clients_total": sum(v for v in clients.values() if isinstance(v, int)),
        "problems": problems,
        "problem_count": len(problems),
    }


@app.get("/api/noc/live")
def api_noc_live():
    cached = get_cache_value(NOC_CACHE, "live")
    if cached is not None:
        return cached
    try:
        payload = build_noc_live()
        return set_cache_value(NOC_CACHE, "live", payload, NOC_CACHE_TTL_SECONDS)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


NOC_HISTORY_POLL_SECONDS = 30
NOC_HISTORY_RETENTION_DAYS = 30


def _device_key(d: Dict) -> str:
    return f"device:{d.get('router_name') or '-'}:{d.get('host') or d.get('name') or '-'}"


def _alert_location(change: Dict) -> str:
    key = str(change.get("key") or "")
    parts = key.split(":")
    if len(parts) >= 2 and parts[0] == "device" and parts[1] != "-":
        return parts[1]
    if len(parts) >= 2 and parts[0] == "site":
        return parts[1]
    return "-"


def _format_noc_alert(change: Dict) -> str:
    old_state = change.get("old_state") or "-"
    new_state = change.get("new_state") or "-"
    kind = "Site" if change.get("kind") == "site" else "Perangkat"
    status = "DOWN" if new_state == "DOWN" else "PULIH"
    icon = "[ALERT]" if new_state == "DOWN" else "[OK]"
    return (
        f"{icon} NOC {status}\n"
        f"Jenis: {kind}\n"
        f"Nama: {change.get('name') or '-'}\n"
        f"Lokasi: {_alert_location(change)}\n"
        f"Status: {old_state} -> {new_state}\n"
        f"Waktu: {change.get('changed_at') or '-'}"
    )


def _send_whatsapp_message(message: str):
    if not WA_ALERT_ENABLED:
        return
    if WA_ALERT_MODE == "web":
        if not WA_TO:
            logging.warning("NOC WA Web alert aktif tapi WA_TO belum diisi")
            return
        headers = {"Content-Type": "application/json"}
        if WA_WEB_SECRET:
            headers["X-Alert-Secret"] = WA_WEB_SECRET
        for to in WA_TO:
            r = requests.post(WA_WEB_URL, headers=headers, json={"to": to, "message": message}, timeout=20)
            if r.status_code >= 400:
                logging.warning("NOC WA Web alert gagal ke %s: %s %s", to, r.status_code, r.text[:500])
        return

    if not (WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN and WA_TO):
        logging.warning("NOC WA alert aktif tapi konfigurasi WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN / WA_TO belum lengkap")
        return

    url = f"https://graph.facebook.com/{WA_GRAPH_VERSION}/{WA_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WA_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    for to in WA_TO:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }
        r = requests.post(url, headers=headers, json=payload, timeout=20)
        if r.status_code >= 400:
            logging.warning("NOC WA alert gagal ke %s: %s %s", to, r.status_code, r.text[:500])


def _send_noc_alerts(transitions: List[Dict]):
    for change in transitions or []:
        try:
            _send_whatsapp_message(_format_noc_alert(change))
        except Exception:
            logging.exception("NOC WA alert gagal dikirim")


def _poll_noc_history():
    """Dipanggil berkala oleh scheduler: rekam kalau ada site/perangkat yang
    status-nya berubah sejak polling terakhir (lihat noc_history.py)."""
    # Deteksi kalau polling sempat berhenti lama (server dimatikan / backend crash)
    try:
        noc_history.record_monitoring_gap()
    except Exception:
        traceback.print_exc()

    try:
        payload = build_noc_live()
    except Exception:
        traceback.print_exc()
        return

    entities = []
    for s in payload.get("sites", []):
        entities.append({"kind": "site", "key": f"site:{s['label']}", "name": s["label"], "state": s["state"]})
    for d in payload.get("devices", []):
        entities.append({"kind": "device", "key": _device_key(d), "name": d.get("name") or "-", "state": d["state"]})

    try:
        transitions = noc_history.record_snapshot(entities)
        _send_noc_alerts(transitions)
    except Exception:
        traceback.print_exc()

    # Sampel metrik buat sparkline tren (ring buffer, retensi beberapa jam saja)
    try:
        samples = [
            {"key": f"site:{s['label']}", "latency_ms": s.get("latency_ms"),
             "loss_pct": s.get("loss_pct"), "state": s["state"]}
            for s in payload.get("sites", [])
        ]
        samples += [
            {"key": _device_key(d), "latency_ms": d.get("latency_ms"),
             "loss_pct": d.get("loss_pct"), "state": d["state"]}
            for d in payload.get("devices", [])
        ]
        noc_history.record_samples(samples)
    except Exception:
        traceback.print_exc()

    # Cache-kan hasilnya juga, biar /api/noc/live nggak query ulang kalau
    # pollingan ini baru saja jalan.
    set_cache_value(NOC_CACHE, "live", payload, NOC_CACHE_TTL_SECONDS)


def _cleanup_noc_history():
    try:
        deleted = noc_history.cleanup_old_events(retention_days=NOC_HISTORY_RETENTION_DAYS)
        logging.info("NOC history cleanup: %s event lama dihapus (retensi %s hari)", deleted, NOC_HISTORY_RETENTION_DAYS)
    except Exception:
        logging.exception("NOC history cleanup: gagal membersihkan event lama")


_scheduler.add_job(
    _poll_noc_history,
    IntervalTrigger(seconds=NOC_HISTORY_POLL_SECONDS),
    id="noc_history_poll",
    replace_existing=True,
)

_scheduler.add_job(
    _cleanup_noc_history,
    CronTrigger(day=1, hour=3, minute=15, timezone="Asia/Jakarta"),
    id="noc_history_cleanup",
    replace_existing=True,
)


@app.get("/api/noc/history")
def api_noc_history(kind: Optional[str] = Query(None, pattern="^(site|device)$"), days: int = Query(7, ge=1, le=90)):
    """Log riwayat downtime: kapan mati, kapan pulih, berapa lama. Lihat
    noc_history.py untuk keterbatasan resolusi & cakupan datanya."""
    try:
        return {
            "success": True,
            "events": noc_history.get_downtime_log(kind=kind, days=days),
            "blackouts": noc_history.get_blackouts(days=days),
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/noc/trend")
def api_noc_trend(minutes: int = Query(120, ge=15, le=360)):
    """Deret sampel latency/loss per site untuk N menit terakhir (sparkline)."""
    try:
        return {"success": True, "minutes": minutes, "series": noc_history.get_trend(minutes=minutes)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/noc/stats")
def api_noc_stats(kind: Optional[str] = Query(None, pattern="^(site|device)$"), days: int = Query(7, ge=1, le=90)):
    """Ringkasan keandalan per entity: uptime %, jumlah insiden, downtime, MTTR."""
    try:
        return {
            "success": True, "days": days,
            "stats": noc_history.get_uptime_stats(kind=kind, days=days),
            "blackouts": noc_history.get_blackouts(days=days),
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
#  REKAP NOC BULANAN  (narasi AI + PDF -> WhatsApp)
# ─────────────────────────────────────────────

def _wa_send_file(path: str, caption: str = ""):
    """Kirim file (PDF) ke WA_TO. Mode 'web' pakai endpoint /send-file di bridge;
    mode 'cloud' upload media ke Graph API lalu kirim sebagai document."""
    if not (WA_ALERT_ENABLED and WA_TO):
        logging.warning("Rekap NOC: WA belum aktif / WA_TO kosong — file tidak dikirim")
        return
    fname = os.path.basename(path)

    if WA_ALERT_MODE == "web":
        headers = {"Content-Type": "application/json"}
        if WA_WEB_SECRET:
            headers["X-Alert-Secret"] = WA_WEB_SECRET
        try:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
        except Exception:
            logging.exception("Rekap NOC: gagal baca PDF %s", path)
            return
        for to in WA_TO:
            try:
                r = requests.post(
                    WA_WEB_FILE_URL, headers=headers, timeout=90,
                    json={"to": to, "filename": fname, "mimetype": "application/pdf",
                          "caption": caption, "data_base64": b64},
                )
                if r.status_code >= 400:
                    logging.warning("Rekap NOC: kirim file ke %s gagal: %s %s", to, r.status_code, r.text[:400])
            except Exception:
                logging.exception("Rekap NOC: kirim file (web) gagal ke %s", to)
        return

    if not (WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN):
        logging.warning("Rekap NOC: konfigurasi WA Cloud belum lengkap — file tidak dikirim")
        return
    try:
        up_url = f"https://graph.facebook.com/{WA_GRAPH_VERSION}/{WA_PHONE_NUMBER_ID}/media"
        with open(path, "rb") as f:
            up = requests.post(
                up_url,
                headers={"Authorization": f"Bearer {WA_ACCESS_TOKEN}"},
                data={"messaging_product": "whatsapp", "type": "application/pdf"},
                files={"file": (fname, f, "application/pdf")},
                timeout=60,
            )
        up.raise_for_status()
        media_id = up.json().get("id")
        if not media_id:
            logging.warning("Rekap NOC: upload media gagal: %s", up.text[:400])
            return
        msg_url = f"https://graph.facebook.com/{WA_GRAPH_VERSION}/{WA_PHONE_NUMBER_ID}/messages"
        for to in WA_TO:
            r = requests.post(
                msg_url,
                headers={"Authorization": f"Bearer {WA_ACCESS_TOKEN}", "Content-Type": "application/json"},
                json={
                    "messaging_product": "whatsapp", "to": to, "type": "document",
                    "document": {"id": media_id, "filename": fname, "caption": caption[:1000]},
                },
                timeout=30,
            )
            if r.status_code >= 400:
                logging.warning("Rekap NOC: kirim document ke %s gagal: %s %s", to, r.status_code, r.text[:400])
    except Exception:
        logging.exception("Rekap NOC: kirim file (cloud) gagal")


def _send_noc_report(result: Dict):
    """Kirim teks ringkasan + PDF ke WhatsApp."""
    try:
        _send_whatsapp_message(result["wa_text"])
    except Exception:
        logging.exception("Rekap NOC: kirim teks WA gagal")
    _wa_send_file(result["pdf_path"], caption=result["period_label"])


def _generate_periodic_report(start_dt: datetime.datetime, end_dt: datetime.datetime,
                              data: Dict, pdf_name: str, title: str) -> Dict:
    """Rekap periodik memakai layout laporan harian (build_summary + make_pdf),
    ditambah satu bagian 'Ringkasan AI' di halaman pertama."""
    ensure_output_dir()
    summary = build_summary(start_dt, end_dt)
    try:
        regenerate_report_assets(summary, start_dt, end_dt)
    except Exception:
        logging.exception("Rekap NOC: gagal buat chart")
    narrative = noc_report.generate_narrative(data)
    pdf_path = os.path.join(BASE_OUTPUT_DIR, pdf_name)
    make_pdf(summary, start_dt, end_dt, pdf_path, ai_summary=narrative)
    return {
        "pdf_path": pdf_path, "pdf_name": pdf_name,
        "period_label": data["period_label"],
        "wa_text": noc_report._wa_text(data, narrative, title),
        "narrative": narrative, "has_ai": bool(narrative), "data": data,
    }


def generate_weekly_report() -> Dict:
    start_dt, end_dt = noc_report._week_range()
    data = noc_report.build_weekly_data()
    stub = start_dt.strftime("%Y%m%d")
    return _generate_periodic_report(start_dt, end_dt, data,
                                     f"NOC_Rekap_Mingguan_{stub}.pdf", "Rekap NOC Mingguan")


def generate_monthly_report(year: Optional[int] = None, month: Optional[int] = None) -> Dict:
    if year is None or month is None:
        year, month = noc_report.previous_month()
    start_dt, end_dt = noc_report._month_range(year, month)
    data = noc_report.build_monthly_data(year, month)
    return _generate_periodic_report(start_dt, end_dt, data,
                                     f"NOC_Rekap_{year:04d}-{month:02d}.pdf", "Rekap NOC Bulanan")


def _auto_send_weekly_noc_report():
    if not NOC_REPORT_ENABLED:
        return
    try:
        r = generate_weekly_report()
        _send_noc_report(r)
        logging.info("Rekap NOC mingguan terkirim (AI: %s) -> %s", r["has_ai"], r["pdf_name"])
    except Exception:
        logging.exception("Rekap NOC mingguan: gagal")


_scheduler.add_job(
    _auto_send_weekly_noc_report,
    CronTrigger(day_of_week="mon", hour=6, minute=0, timezone="Asia/Jakarta"),
    id="noc_weekly_report",
    replace_existing=True,
)
# job lama (kalau ada dari versi sebelumnya) dibuang
try:
    _scheduler.remove_job("noc_monthly_report")
except Exception:
    pass


def _report_response(r: Dict, sent: bool) -> Dict:
    return {
        "success": True, "period": r["period_label"], "pdf_name": r["pdf_name"],
        "pdf_path": r["pdf_path"], "has_ai": r["has_ai"], "sent": sent,
        "wa_text": r["wa_text"],
    }


@app.post("/api/noc/report/weekly")
def api_noc_report_weekly(send: bool = Query(False, description="true = kirim ke WhatsApp juga")):
    """Rekap NOC minggu kalender penuh terakhir (Senin-Minggu)."""
    try:
        r = generate_weekly_report()
        if send:
            _send_noc_report(r)
        return _report_response(r, send)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/noc/report/weekly/pdf")
def api_noc_report_weekly_pdf():
    try:
        r = generate_weekly_report()
        return FileResponse(r["pdf_path"], media_type="application/pdf", filename=r["pdf_name"])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/noc/report/monthly")
def api_noc_report_monthly(
    year: Optional[int] = Query(None, ge=2024, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    send: bool = Query(False),
):
    """Rekap NOC satu bulan (default: bulan lalu). Manual — jadwal otomatis = mingguan."""
    try:
        r = generate_monthly_report(year, month)
        if send:
            _send_noc_report(r)
        return _report_response(r, send)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/noc/report/monthly/pdf")
def api_noc_report_monthly_pdf(
    year: Optional[int] = Query(None, ge=2024, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    try:
        r = generate_monthly_report(year, month)
        return FileResponse(r["pdf_path"], media_type="application/pdf", filename=r["pdf_name"])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/schedule/info")
def api_schedule_info():
    job = _scheduler.get_job("daily_report")
    next_run = job.next_run_time.strftime("%A, %d %b %Y %H:%M %Z") if job and job.next_run_time else "–"
    return {
        "schedule": "Setiap hari pukul 10:00 WIB (periode kemarin 03:00 - 24:00)",
        "next_run": next_run,
        "recipients": TO_EMAIL,
    }


@app.post("/api/schedule/trigger-now")
def api_schedule_trigger_now():
    """Trigger pengiriman laporan harian sekarang (untuk testing)."""
    try:
        _auto_send_daily_report()
        return {"success": True, "message": f"Laporan berhasil dikirim ke: {', '.join(TO_EMAIL)}"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/info")
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
            "/api/mikrotik/queue-tree",
            "/api/mikrotik/ether-traffic"
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


@app.get("/api/mikrotik/ether-traffic")
def api_mikrotik_ether_traffic(router_id: int | None = None):
    """Live bandwidth per port Ethernet fisik (RX/TX) — lihat get_ether_traffic."""
    try:
        data = get_ether_traffic(router_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mikrotik/netwatch")
def api_mikrotik_netwatch(router_id: int | None = None):
    try:
        data = get_netwatch(router_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mikrotik/status")
def api_mikrotik_status():
    try:
        data = get_router_status()
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

        regenerate_report_assets(summary, start_dt, end_dt)
        make_pdf(summary, start_dt, end_dt, REPORT_PATH)

        # Unique filename per download so the browser never reuses an old cached file
        download_name = (
            f"Laporan_Trafik_{start_dt.strftime('%Y%m%d-%H%M')}_"
            f"{end_dt.strftime('%Y%m%d-%H%M')}.pdf"
        )

        return FileResponse(
            REPORT_PATH,
            media_type="application/pdf",
            filename=download_name,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}
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

        regenerate_report_assets(summary, start_dt, end_dt)
        dhcp_rows = make_pdf(summary, start_dt, end_dt, REPORT_PATH)
        send_email(summary, start_dt, end_dt, REPORT_PATH, dhcp_rows=dhcp_rows)

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


FRONTEND_DIST = BASE_DIR.parent.parent / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    """StaticFiles yang fallback ke index.html buat route sisi-klien (mis. /noc),
    biar refresh / akses langsung URL React Router nggak balas 404 Not Found."""

    async def get_response(self, path, scope):
        from starlette.exceptions import HTTPException as _StarletteHTTPException
        try:
            return await super().get_response(path, scope)
        except _StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


if FRONTEND_DIST.exists():
    app.mount("/", SPAStaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")


def main():
    import uvicorn
    host = os.getenv("APP_HOST", "0.0.0.0")
    port = int(os.getenv("APP_PORT", "8095"))
    uvicorn.run(app, host=host, port=port, reload=False, access_log=False)


if __name__ == "__main__":
    main()
