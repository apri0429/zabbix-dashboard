#!/usr/bin/env python3
"""
Rekap NOC berkala (mingguan / bulanan) + ringkasan AI, untuk laporan ke atasan.

Sumber data:
- `noc_events` (noc_history.py): uptime %, jumlah insiden, MTTR, perangkat flapping.
- Zabbix (app.build_summary): pemakaian bandwidth per site (rata-rata, puncak, % utilisasi).
- MikroTik DHCP (app._noc_client_counts): jumlah klien aktif — snapshot saat laporan dibuat.

Ringkasan Bahasa Indonesia dibuat oleh Hermes (hermes_ai.py) atau Claude. Kalau tidak ada
API key, PDF tetap dibuat tanpa bagian ringkasan.

Dipakai dari app.py:
- build_weekly_report(ref_date=None)   -> minggu penuh terakhir (Senin-Minggu)
- build_monthly_report(year, month)    -> bulan (default: bulan lalu)
Keduanya balikin dict: {pdf_path, pdf_name, wa_text, narrative, has_ai, data}.
"""

import os
import re
import calendar
import logging
import datetime
from typing import Dict, List, Optional, Tuple

import requests

try:
    from . import noc_history, hermes_ai
except ImportError:
    import noc_history
    import hermes_ai

BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", r"C:\Zabbix")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
NOC_REPORT_MODEL = os.getenv("NOC_REPORT_MODEL", "claude-opus-5").strip()

_BULAN_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
             "Agustus", "September", "Oktober", "November", "Desember"]

# Cakupan pemantauan (persen periode yang benar-benar terpolling) minimal supaya
# angka uptime/insiden layak disajikan tanpa peringatan.
COVERAGE_OK_PCT = float(os.getenv("NOC_REPORT_MIN_COVERAGE_PCT", "90"))

# Di bawah ini, angka periode dianggap tidak layak dipakai sebagai PEMBANDING tren
# (mis. "100%" yang sebenarnya berarti "tidak ada data sama sekali").
COVERAGE_TREND_PCT = float(os.getenv("NOC_REPORT_MIN_TREND_COVERAGE_PCT", "70"))


# ─────────────────────────── util ───────────────────────────

def _month_range(year: int, month: int) -> Tuple[datetime.datetime, datetime.datetime]:
    start = datetime.datetime(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = datetime.datetime(year, month, last_day) + datetime.timedelta(days=1)
    return start, end


def previous_month(today: Optional[datetime.date] = None) -> Tuple[int, int]:
    today = today or datetime.date.today()
    prev = today.replace(day=1) - datetime.timedelta(days=1)
    return prev.year, prev.month


def _week_range(ref: Optional[datetime.date] = None) -> Tuple[datetime.datetime, datetime.datetime]:
    """7 hari penuh terakhir sampai kemarin: [ref-7 hari 00:00, ref 00:00).
    Kalau dijalankan hari Senin (jadwal otomatis), otomatis pas Senin-Minggu."""
    return noc_history.last_full_week_range(ref)  # sama dengan "Minggu lalu" di Network Log


def _short(label: str) -> str:
    return (label or "").replace("Mikrotik ", "").replace(" - ", " / ").strip()


def _fmt_dur(sec: Optional[float]) -> str:
    if sec is None:
        return "-"
    sec = int(sec)
    if sec < 60:
        return f"{sec} dtk"
    m = sec // 60
    if m < 60:
        return f"{m} mnt"
    h = m // 60
    if h < 24:
        return f"{h}j {m % 60}m"
    return f"{h // 24} hari {h % 24}j"


def _fmt_date_id(d: datetime.date) -> str:
    return f"{d.day} {_BULAN_ID[d.month]} {d.year}"


def _fmt_pct(v: Optional[float], dec: int = 1) -> str:
    """Persen untuk laporan manajemen: 1 desimal. Angka seperti 93.988% memberi
    kesan presisi yang tidak dimiliki datanya."""
    return "-" if v is None else f"{v:.{dec}f}%"


def _fmt_mbps(v: Optional[float]) -> str:
    """Selalu 2 desimal supaya kolom angka rata (0.00, bukan 0)."""
    return "-" if v is None else f"{v:.2f}"


def _fmt_ms(v: Optional[float]) -> str:
    return "-" if v is None else f"{v:.1f} ms"


def _fmt_dt_id(ts: Optional[str]) -> str:
    """'2026-10-05 14:25:31' -> '05-10 14:25' (hari-bulan, sesuai format PDF).
    Sebelumnya dipotong jadi '10-05 14:25' yang terbaca bulan-hari."""
    if not ts:
        return "-"
    try:
        dt = datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return ts
    return dt.strftime("%d-%m %H:%M")


def _fmt_coverage_note(cov: Optional[Dict]) -> str:
    """Satu baris peringatan kalau periode ini tidak terpantau penuh."""
    if not cov or cov.get("coverage_pct") is None:
        return ""
    pct = cov["coverage_pct"]
    if pct >= COVERAGE_OK_PCT:
        return ""
    jam = cov["blackout_seconds"] / 3600.0
    return (f"Pemantauan hanya aktif {pct:.1f}% periode ini "
            f"({cov['blackout_count']}x jeda, total {jam:.1f} jam tidak terpantau). "
            "Jumlah insiden & total downtime di bawah ini adalah BATAS BAWAH — "
            "gangguan yang mulai dan selesai saat pemantauan mati tidak tercatat.")


def _strip_md(s: str) -> str:
    import re
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s or "")
    s = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", s)
    s = re.sub(r"^\s*#+\s*", "", s)
    s = re.sub(r"^\s*[\*•]\s+", "- ", s)
    return s.strip()


def _break_long_words(s: str, limit: int = 70) -> str:
    out = []
    for w in (s or "").split(" "):
        while len(w) > limit:
            out.append(w[:limit])
            w = w[limit:]
        out.append(w)
    return " ".join(out)


def _lat1(s: str) -> str:
    if s is None:
        return ""
    repl = {
        "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u2022": "-",
        "\u00a0": " ", "\u2192": "->", "\u2265": ">=", "\u2264": "<=",
        "\u00d7": "x", "\u2212": "-",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


# ─────────────────────── ambil data dari app.py (lazy) ───────────────────────

def _known_site_labels() -> List[str]:
    try:
        try:
            from .app import ITEM_MAP
        except ImportError:
            from app import ITEM_MAP
        return list(ITEM_MAP.keys())
    except Exception:
        return []


def _bandwidth_summary(start: datetime.datetime, end: datetime.datetime) -> List[Dict]:
    """Pemakaian bandwidth per site untuk window, dari Zabbix (reuse app.build_summary)."""
    try:
        try:
            from .app import build_summary
        except ImportError:
            from app import build_summary
        rows = build_summary(start, end)
    except Exception:
        logging.exception("NOC report: gagal ambil ringkasan bandwidth")
        return []

    out = []
    for idx, r in enumerate(rows):
        peak = max(r.get("peak_download") or 0.0, r.get("peak_upload") or 0.0)
        util = max(r.get("max_peakraw_pct") or 0.0, r.get("max_avg_pct") or 0.0)
        cap = r.get("capacity") or 0
        out.append({
            "idx": idx,
            # Puncak di atas kapasitas langganan tidak mungkin terjadi secara fisik;
            # biasanya artefak sampling/counter Zabbix atau kapasitas yang salah
            # diisi. Ditandai supaya tidak dilaporkan sebagai lonjakan nyata.
            "peak_over_capacity": bool(cap and peak > cap * 1.001),
            "peak_pct_of_cap": round(100.0 * peak / cap, 1) if cap else None,
            "avg_down": round(r.get("avg_download") or 0.0, 2),
            "avg_up": round(r.get("avg_upload") or 0.0, 2),
            "peak_down": round(r.get("peak_download") or 0.0, 2),
            "peak_up": round(r.get("peak_upload") or 0.0, 2),
            "score": round(r.get("weighted_score") or 0.0, 1),
            "label": _short(r.get("label", "")),
            "capacity": r.get("capacity") or 0,
            "avg_mbps": round(r.get("avg") or 0.0, 1),
            "peak_mbps": round(peak, 1),
            "util_pct": round(util, 1),
            "status": r.get("status", "-"),
            "latency_avg_ms": round(r.get("latency_avg_ms") or 0.0, 1) if r.get("latency_sample") else None,
            "latency_p95_ms": round(r.get("latency_p95_ms") or 0.0, 1) if r.get("latency_sample") else None,
            "loss_avg_pct": round(r.get("loss_avg_pct") or 0.0, 2) if r.get("latency_sample") else None,
            "quality": r.get("conn_quality", "-"),
            "vpn_measured": bool(r.get("vpn_measured")),
            "is_standby": bool(r.get("is_standby")),
        })
    out.sort(key=lambda x: -x["util_pct"])
    return out


def _client_snapshot() -> Tuple[Dict[str, Optional[int]], Optional[int]]:
    try:
        try:
            from .app import _noc_client_counts
        except ImportError:
            from app import _noc_client_counts
        counts = _noc_client_counts()
    except Exception:
        logging.exception("NOC report: gagal ambil jumlah klien")
        return {}, None
    total = sum(v for v in counts.values() if isinstance(v, int)) if counts else None
    return counts, total


# ─────────────────────────── agregasi data ───────────────────────────

def _isp_link_stats(start: datetime.datetime, end: datetime.datetime) -> List[Dict]:
    """Uptime tiap link ISP (perangkat Netwatch yang namanya mengandung 'ISP').
    Link yang tidak pernah mati tetap ikut (uptime 100%)."""
    # Satu entity_key bisa punya beberapa nama kalau komentar Netwatch di router
    # pernah diganti (mis. "Biznet ISP", "Biznet ISP  Duta Garden"). Dulu dict ini
    # diisi tanpa urutan, jadi nama yang terpakai berubah-ubah tiap kali laporan
    # dibuat. Sekarang dipilih yang PALING SPESIFIK (terpanjang sesudah spasi
    # ganda dirapikan), dengan nama alfabetis sebagai penentu kalau sama panjang.
    names: Dict[str, str] = {}
    try:
        conn = noc_history._connect()
        try:
            rows = conn.execute("SELECT DISTINCT entity_key, entity_name FROM noc_events "
                                "WHERE kind='device' ORDER BY entity_key, entity_name").fetchall()
        finally:
            conn.close()
        cands: Dict[str, List[str]] = {}
        for r in rows:
            nm = re.sub(r"\s+", " ", (r["entity_name"] or "")).strip()
            if "isp" in nm.lower():
                cands.setdefault(r["entity_key"], []).append(nm)
        for key, opts in cands.items():
            names[key] = sorted(set(opts), key=lambda n: (-len(n), n))[0]
    except Exception:
        logging.exception("NOC report: gagal baca daftar link ISP")
    stats = {d["key"]: d for d in noc_history.get_uptime_stats_range(
        start, end, kind="device", min_seconds=noc_history.REPORT_MIN_INCIDENT_SECONDS)}
    out = []
    for key, name in names.items():
        d = stats.get(key)
        out.append({"key": key, "name": _short(name),
                    "uptime_pct": d["uptime_pct"] if d else 100.0,
                    "downtime_seconds": d["downtime_seconds"] if d else 0,
                    "incidents": d["incidents"] if d else 0})
    out.sort(key=lambda x: (x["uptime_pct"] if x["uptime_pct"] is not None else 100.0, x["name"]))
    return out


def _avg_uptime(links: List[Dict]) -> Optional[float]:
    vals = [l["uptime_pct"] for l in links if l.get("uptime_pct") is not None]
    return round(sum(vals) / len(vals), 3) if vals else None


def _build_period_data(start: datetime.datetime, end: datetime.datetime,
                       period_label: str, prev_start: datetime.datetime,
                       prev_end: datetime.datetime, prev_label: str,
                       per_bucket: str = "day") -> Dict:
    now = datetime.datetime.now()
    window_sec = (min(end, now) - start).total_seconds()
    full_sec = (end - start).total_seconds()

    # Seberapa banyak periode ini (dan pembandingnya) benar-benar terpantau. Tanpa
    # ini, backend yang sempat mati berhari-hari tetap menghasilkan "uptime 93%"
    # dan "1 kejadian" yang terbaca seolah hasil pemantauan penuh.
    coverage = noc_history.get_coverage(start, end)
    prev_coverage = noc_history.get_coverage(prev_start, prev_end)
    cov_pct = coverage.get("coverage_pct")
    prev_cov_pct = prev_coverage.get("coverage_pct")
    coverage_ok = cov_pct is None or cov_pct >= COVERAGE_OK_PCT
    # Pembanding dipakai hanya kalau KEDUA periode cukup terpantau.
    trend_ok = (cov_pct is not None and prev_cov_pct is not None
                and cov_pct >= COVERAGE_TREND_PCT and prev_cov_pct >= COVERAGE_TREND_PCT)

    # Laporan hanya memuat mati >= MIN_INCIDENT_SECONDS (ambang yang sama dengan WA &
    # Network Log); kedipan lebih
    # pendek tidak dihitung di uptime, jumlah insiden, log, maupun total downtime.
    _min = noc_history.REPORT_MIN_INCIDENT_SECONDS
    sites = noc_history.get_uptime_stats_range(start, end, kind="site", min_seconds=_min)
    devices = noc_history.get_uptime_stats_range(start, end, kind="device", min_seconds=_min)
    incidents = noc_history.get_downtime_log_range(start, end, min_seconds=_min)
    prev_sites = {s["key"]: s for s in noc_history.get_uptime_stats_range(
        prev_start, prev_end, kind="site", min_seconds=_min)}

    seen = {s["key"] for s in sites}
    for label in _known_site_labels():
        key = f"site:{label}"
        if key not in seen:
            sites.append({"kind": "site", "key": key, "name": label, "incidents": 0,
                          "downtime_seconds": 0, "uptime_pct": 100.0,
                          "mttr_seconds": None, "ongoing": False})

    for s in sites:
        prev = prev_sites.get(s["key"])
        pv = prev.get("uptime_pct") if prev else None
        if not trend_ok:
            pv = None          # periode pembanding tidak terpantau cukup
        s["prev_uptime_pct"] = pv
        s["delta_pct"] = (round(s["uptime_pct"] - pv, 3)
                          if pv is not None and s.get("uptime_pct") is not None else None)
        s["label"] = _short(s["name"])
    sites.sort(key=lambda x: (x["uptime_pct"] if x["uptime_pct"] is not None else 100.0, -x["incidents"]))

    flapping = sorted([d for d in devices if d["incidents"] >= 3],
                      key=lambda x: (-x["incidents"], -(x["downtime_seconds"] or 0)))[:12]
    for d in flapping:
        d["label"] = _short(d["name"])

    total_incidents = len(incidents)
    total_downtime = sum(i["duration_seconds"] for i in incidents)
    site_incidents = [i for i in incidents if i["kind"] == "site"]
    device_incidents = [i for i in incidents if i["kind"] == "device"]
    # Log ISP mati = perangkat Netwatch yang namanya mengandung "ISP" (Indibiz, Biznet ISP, dst).
    # Jenis "site" (ping lewat VPN) tidak dipakai karena tidak mewakili link ISP-nya.
    isp_dev = [i for i in device_incidents if "isp" in (i["name"] or "").lower()]
    isp_dev.sort(key=lambda i: i["down_at"] or "")
    isp_incidents = [
        {"name": _short(i["name"]), "down_at": i["down_at"], "up_at": i["up_at"],
         "duration_seconds": i["duration_seconds"], "ongoing": i["ongoing"],
         # Bagian durasi yang jatuh saat pemantauan mati: durasi yang menelan
         # blackout tidak boleh disajikan sebagai angka pasti.
         "unmonitored_seconds": i.get("unmonitored_seconds", 0),
         "observed_seconds": i.get("observed_seconds", i["duration_seconds"]),
         "duration_certain": i.get("duration_certain", True)}
        for i in isp_dev
    ]
    isp_downtime = sum(i["duration_seconds"] for i in isp_dev)
    # Router site yang tidak terjangkau dipisah dari "perangkat lain": satu
    # kejadian ini berarti SATU SITE putus, bukan satu AP/switch.
    router_dev = [i for i in device_incidents
                  if (i["name"] or "").startswith("Router ") and i not in isp_dev]
    router_incidents = [
        {"name": i["name"], "down_at": i["down_at"], "up_at": i["up_at"],
         "duration_seconds": i["duration_seconds"], "ongoing": i["ongoing"]}
        for i in sorted(router_dev, key=lambda i: i["down_at"] or "")
    ]
    # Periode TIDAK TERPANTAU (router site tak terbaca, status Netwatch tak
    # terbaca, pemantauan terhenti). Tanpa ini periode itu terbaca "100% hidup".
    unmon_periods = noc_history.get_unmonitored_range(start, end, min_seconds=_min)
    unmonitored = noc_history.summarize_unmonitored(unmon_periods)
    unmon_by_key: Dict[str, int] = {}
    for p in unmon_periods:
        unmon_by_key[p["key"]] = unmon_by_key.get(p["key"], 0) + p["seconds"]
    isp_links = _isp_link_stats(start, end)
    for l in isp_links:
        l["unmonitored_seconds"] = unmon_by_key.get(l["key"], 0)
    isp_uptime = _avg_uptime(isp_links)
    prev_isp_uptime = _avg_uptime(_isp_link_stats(prev_start, prev_end)) if trend_ok else None
    other_device_incidents = len(device_incidents) - len(isp_dev) - len(router_dev)

    up_vals = [s["uptime_pct"] for s in sites if s.get("uptime_pct") is not None]
    avg_uptime = round(sum(up_vals) / len(up_vals), 3) if up_vals else None
    prev_up_vals = [s["uptime_pct"] for s in prev_sites.values() if s.get("uptime_pct") is not None]
    prev_avg_uptime = (round(sum(prev_up_vals) / len(prev_up_vals), 3)
                       if prev_up_vals and trend_ok else None)
    worst = sites[0] if sites and sites[0]["incidents"] > 0 else None

    bandwidth = _bandwidth_summary(start, end)
    clients, clients_total = _client_snapshot()

    return {
        "period_label": period_label,
        "prev_label": prev_label,
        "period_start": start.strftime("%Y-%m-%d"),
        "period_end": (end - datetime.timedelta(days=1)).strftime("%Y-%m-%d"),
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "avg_uptime_pct": avg_uptime,
        "prev_avg_uptime_pct": prev_avg_uptime,
        "total_incidents": total_incidents,
        "total_site_incidents": len(site_incidents),
        "total_device_incidents": len(device_incidents),
        "total_downtime_seconds": total_downtime,
        "total_downtime_human": _fmt_dur(total_downtime),
        "isp_incidents": isp_incidents,
        "isp_links": isp_links,
        "isp_uptime_pct": isp_uptime,
        "prev_isp_uptime_pct": prev_isp_uptime,
        "isp_downtime_seconds": isp_downtime,
        "isp_downtime_human": _fmt_dur(isp_downtime),
        "other_device_incidents": other_device_incidents,
        "router_incidents": router_incidents,
        "unmonitored": unmonitored,
        "sites": sites,
        "flapping_devices": flapping,
        "worst_site": worst,
        "bandwidth": bandwidth,
        "clients": clients,
        "clients_total": clients_total,
        # Periode belum selesai (mis. laporan dibuat di tengah minggu)
        "period_unfinished": window_sec < full_sec - 3600,
        # Cakupan pemantauan
        "coverage": coverage,
        "coverage_pct": cov_pct,
        "coverage_ok": coverage_ok,
        "prev_coverage_pct": prev_cov_pct,
        "trend_comparable": trend_ok,
        "coverage_note": _fmt_coverage_note(coverage),
        # Dipakai prompt AI & PDF: data periode ini tidak utuh, entah karena
        # periodenya belum selesai ATAU karena pemantauan sempat mati.
        "data_incomplete": (window_sec < full_sec - 3600) or not coverage_ok,
    }


def build_weekly_data(ref: Optional[datetime.date] = None) -> Dict:
    start, end = _week_range(ref)
    p_start, p_end = start - datetime.timedelta(days=7), start
    lbl = f"Periode 7 hari: {_fmt_date_id(start.date())} - {_fmt_date_id((end - datetime.timedelta(days=1)).date())}"
    plbl = f"7 hari sebelumnya ({_fmt_date_id(p_start.date())} - {_fmt_date_id((p_end - datetime.timedelta(days=1)).date())})"
    return _build_period_data(start, end, lbl, p_start, p_end, plbl)


def build_monthly_data(year: int, month: int) -> Dict:
    start, end = _month_range(year, month)
    p_year, p_month = (year - 1, 12) if month == 1 else (year, month - 1)
    p_start, p_end = _month_range(p_year, p_month)
    return _build_period_data(start, end, f"{_BULAN_ID[month]} {year}",
                              p_start, p_end, f"{_BULAN_ID[p_month]} {p_year}")


# ─────────────────────────── ringkasan AI ───────────────────────────

_SYSTEM_PROMPT = (
    "Kamu menulis ringkasan laporan jaringan untuk dibaca lewat WhatsApp oleh "
    "orang AWAM (bukan teknisi). Bahasa Indonesia sederhana, singkat, jelas, "
    "tanpa basa-basi. Hindari istilah teknis (latency, packet loss, utilisasi, "
    "VPN, MTTR). Ganti dengan 'koneksi lambat', 'koneksi putus-putus', "
    "'jalur internet penuh'. Jelaskan ARTI angka bagi pengguna, jangan cuma "
    "mengulang angka.\n\n"
    "Tulis dengan format PERSIS berikut (judul di baris sendiri, tanpa nomor, "
    "tanpa tanda '#' atau '**'):\n\n"
    "Status\n"
    "Satu baris: BAIK / PERLU PERHATIAN / KRITIS + alasan satu kalimat pendek.\n\n"
    "Internet\n"
    "2-3 bullet (awali '- '). Sebut internet/ISP yang mati: lokasi, tanggal & jam, "
    "dan lamanya. Kalau tidak ada yang mati, tulis '- Tidak ada internet mati.' "
    "Sebut uptime internet, dan bandingkan dengan periode lalu HANYA kalau data "
    "pembandingnya diberikan. Jangan menyebut berapa pengguna terdampak suatu "
    "gangguan - jumlah pengguna yang ada hanya hitungan saat laporan dibuat.\n\n"
    "Bandwidth\n"
    "2-3 bullet (awali '- '). Jelaskan bandwidth = kapasitas jalur internet "
    "(seperti lebar jalan). Pakai STATUS beban dari data (STABIL/PADAT/TINGGI) sebagai "
    "patokan - sama dengan PDF - jangan menilai sendiri dari angka puncak. Sebut lokasi "
    "berstatus TINGGI/PADAT dan artinya (internet bisa lambat saat jam sibuk, untuk "
    "berapa pengguna). Puncak sesaat tinggi tapi status STABIL = hanya lonjakan singkat. "
    "Sebut juga lokasi yang masih lega. Kalau data menandai puncak MELEBIHI kapasitas "
    "langganan, itu kemungkinan besar salah ukur (angka di atas kecepatan paket itu "
    "mustahil) - jangan laporkan sebagai kejadian nyata; cukup sebut sekali bahwa angka "
    "puncak di lokasi itu perlu diverifikasi.\n\n"
    "Perlu Tindakan\n"
    "1-3 bullet (awali '- '), paling prioritas dulu, satu kalimat pendek tiap "
    "butir. Kalau tidak ada: '- Tidak ada, kondisi aman.'\n\n"
    "Aturan: JANGAN mengarang angka/penyebab di luar data. Tulis nama ISP PERSIS "
    "seperti di data (Indibiz, Biznet, Indihome - jangan tertukar). Kalau data "
    "periode belum penuh, sebut singkat. Tanpa tabel. Total MAKSIMAL 170 kata."
)


def _narrative_prompt(data: Dict) -> str:
    du = data["avg_uptime_pct"]
    pu = data["prev_avg_uptime_pct"]
    cmp_txt = (f" (data {data['prev_label']} belum tersedia — jangan bandingkan tren angka)"
               if pu is None else f" (periode sebelumnya {pu}%)")
    lines = [
        f"Periode: {data['period_label']}.",
        f"Uptime internet (rata-rata link ISP dari Netwatch): "
        f"{('belum ada data' if data.get('isp_uptime_pct') is None else str(data['isp_uptime_pct']) + '%')}"
        + ("" if data.get("prev_isp_uptime_pct") is None else f" (periode lalu {data['prev_isp_uptime_pct']}%)")
        + ".",
        f"Internet/ISP mati: {len(data['isp_incidents'])}x, total {data['isp_downtime_human']}. "
        f"Insiden perangkat lain (bukan ISP): {data['other_device_incidents']}.",
    ]
    if data.get("router_incidents"):
        lines.append("Router site tidak terjangkau (satu site putus total): " + "; ".join(
            f"{r['name']} {_fmt_dur(r['duration_seconds'])}{' (MASIH)' if r['ongoing'] else ''}"
            for r in data["router_incidents"]) + ".")
    if data.get("unmonitored"):
        lines.append(
            "PERIODE TIDAK TERPANTAU (status perangkat tidak diketahui, BUKAN berarti hidup; "
            "uptime perangkat ini hanya batas atas - JANGAN sebut stabil/100%): " + "; ".join(
                f"{u['location'] or 'semua perangkat'} {_fmt_dur(u['seconds'])} ({u['reason']})"
                for u in data["unmonitored"][:10]) + ".")
    if not data.get("coverage_ok") and data.get("coverage_pct") is not None:
        cov = data["coverage"]
        lines.append(
            f"CATATAN PENTING — CAKUPAN PEMANTAUAN: sistem pemantauan hanya aktif "
            f"{data['coverage_pct']:.1f}% dari periode ini "
            f"({cov['blackout_count']}x jeda, total {cov['blackout_seconds']/3600:.1f} jam mati). "
            "Jumlah insiden & total downtime di atas adalah BATAS BAWAH: gangguan yang "
            "mulai dan selesai saat pemantauan mati TIDAK tercatat. WAJIB sebutkan "
            "keterbatasan ini di bagian Status, dan JANGAN menyatakan kondisi aman "
            "hanya karena insiden tercatat sedikit.")
    elif data.get("period_unfinished"):
        lines.append("CATATAN PENTING: periode ini belum selesai (baru sebagian), "
                     "angka insiden/downtime kemungkinan lebih rendah dari kenyataan — sebutkan ini.")

    if not data.get("trend_comparable"):
        lines.append("JANGAN membandingkan dengan periode sebelumnya dan jangan menyebut "
                     "naik/turun: data periode pembanding tidak terpantau cukup untuk "
                     "dijadikan dasar tren.")

    ct = data.get("clients_total")
    if ct is not None:
        lines.append(f"\nJumlah klien/pengguna aktif (snapshot saat laporan dibuat, "
                     f"BUKAN jumlah pengguna saat gangguan terjadi — jangan pakai angka ini "
                     f"untuk mengklaim berapa pengguna terdampak suatu outage): {ct} total.")
        detail = ", ".join(f"{_short(k)}: {v}" for k, v in (data.get("clients") or {}).items()
                           if isinstance(v, int))
        if detail:
            lines.append(f"Per lokasi -> {detail}. "
                         "(Bahas jumlah pengguna per lokasi di Ringkasan Eksekutif, "
                         "dan kaitkan dengan beban bandwidth lokasi tsb.)")

    if data.get("bandwidth"):
        lines.append("\nKondisi per site (bandwidth rata-rata/puncak Mbps, % utilisasi, "
                     "status beban, latency rata-rata & P95, packet loss, kualitas link):")
        for b in data["bandwidth"]:
            cap = f", kapasitas {b['capacity']} Mbps" if b["capacity"] else ""
            lat = ("latency n/a" if b.get("latency_avg_ms") is None
                   else f"latency {b['latency_avg_ms']}ms (P95 {b['latency_p95_ms']}ms), "
                        f"loss {b['loss_avg_pct']}%, kualitas {b['quality']}")
            flags = []
            if b.get("vpn_measured"):
                flags.append("latency diukur LEWAT VPN — cerminkan kesehatan VPN, bukan mutu ISP site ini")
            if b.get("is_standby"):
                flags.append("link cadangan/standby")
            fl = f" [{'; '.join(flags)}]" if flags else ""
            lines.append(f"- {b['label']}: {b['avg_mbps']}/{b['peak_mbps']} Mbps, "
                         f"utilisasi {b['util_pct']}%, beban {b['status']}, {lat}{cap}{fl}")

    isp = data.get("isp_incidents") or []
    if isp:
        lines.append(f"\nKejadian internet/ISP mati (sumber Netwatch; {len(isp)}x; jam mati -> jam pulih, durasi):")
        for i in isp[:40]:
            up = i["up_at"] or "masih mati"
            note = ""
            if not i.get("duration_certain", True):
                note = (f" [DURASI PERKIRAAN: hanya "
                        f"{_fmt_dur(i.get('observed_seconds') or 0)} yang terpantau, "
                        f"sisanya saat pemantauan mati]")
            lines.append(f"- {i['name']}: {i['down_at']} -> {up}, "
                         f"{_fmt_dur(i['duration_seconds'])}{note}")
        lines.append("(Sebutkan kejadian ISP mati di Poin Penting lengkap dengan "
                     "nama ISP/lokasi, tanggal & jam, dan durasinya.)")
        if any(not i.get("duration_certain", True) for i in isp):
            lines.append("PENTING: durasi bertanda DURASI PERKIRAAN jangan disebut sebagai "
                         "angka pasti. Sebut sebagai perkiraan dan jelaskan singkat bahwa "
                         "sebagian waktunya tidak terpantau, jadi bisa jadi sebenarnya "
                         "lebih pendek.")
    else:
        lines.append("\nTidak ada kejadian ISP mati pada periode ini.")

    if data.get("isp_links"):
        lines.append("\nUptime tiap link ISP (Netwatch):")
        for l in data["isp_links"]:
            lines.append(f"- {l['name']}: {l['uptime_pct']}% | mati {l['incidents']}x, "
                         f"total {_fmt_dur(l['downtime_seconds'])}")

    lines.append("\nUptime per site (ping, bukan status ISP):")
    for s in data["sites"]:
        d = "" if s["delta_pct"] is None else f", perubahan {s['delta_pct']:+.2f} poin"
        lines.append(f"- {s['label']}: {s['uptime_pct']}% | {s['incidents']} insiden | "
                     f"MTTR {_fmt_dur(s['mttr_seconds'])} | downtime {_fmt_dur(s['downtime_seconds'])}{d}")

    if data["flapping_devices"]:
        lines.append("\nPerangkat sering putus-nyambung (>=3x):")
        for x in data["flapping_devices"]:
            lines.append(f"- {x['label']}: {x['incidents']}x, total downtime {_fmt_dur(x['downtime_seconds'])}")
    return "\n".join(lines)


def generate_narrative(data: Dict) -> Optional[str]:
    prompt = _narrative_prompt(data)
    if hermes_ai.enabled():
        out = hermes_ai.complete(_SYSTEM_PROMPT, prompt)
        if out:
            return out
    if ANTHROPIC_API_KEY:
        out = _narrative_anthropic(prompt)
        if out:
            return out
    logging.info("NOC report: Hermes belum dikonfigurasi / ANTHROPIC_API_KEY kosong — ringkasan AI dilewati")
    return None


def _narrative_anthropic(prompt: str) -> Optional[str]:
    try:
        import anthropic
    except ImportError:
        logging.warning("NOC report: paket 'anthropic' belum terpasang — ringkasan AI dilewati")
        return None
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = dict(model=NOC_REPORT_MODEL, max_tokens=4000,
                      system=_SYSTEM_PROMPT, messages=[{"role": "user", "content": prompt}])
        if NOC_REPORT_MODEL.startswith(("claude-opus-5", "claude-sonnet-5", "claude-fable",
                                       "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8",
                                       "claude-sonnet-4-6")):
            kwargs["thinking"] = {"type": "adaptive"}
        msg = client.messages.create(**kwargs)
        return "\n".join(b.text for b in msg.content
                         if getattr(b, "type", None) == "text").strip() or None
    except Exception:
        logging.exception("NOC report: gagal membuat ringkasan AI")
        return None


# ───────────────── teks WhatsApp ─────────────────
# PDF-nya dibuat di app._generate_periodic_report (pakai layout laporan harian).

def _wa_narrative(text: str) -> str:
    """Rapikan keluaran AI untuk WhatsApp: judul tebal, bullet pakai titik."""
    heads = ("status", "internet", "bandwidth", "perlu tindakan")
    bullet = "•"
    out = []
    for ln in (text or "").strip().splitlines():
        ln = re.sub(r"[*#`]+", "", ln).strip()
        if not ln:
            if out and out[-1] != "":
                out.append("")
            continue
        if ln.lower().rstrip(":") in heads:
            out.append("*" + ln.rstrip(":") + "*")
        elif ln[0] in ("-", bullet):
            out.append(bullet + " " + ln.lstrip("-" + bullet + " ").strip())
        else:
            out.append(ln)
    return "\n".join(out).strip()


def _busy_hours_label() -> str:
    m = re.fullmatch(r"\s*(\d{1,2})\s*-\s*(\d{1,2})\s*", os.getenv("BANDWIDTH_BUSY_HOURS", "07-17"))
    return f"{int(m.group(1)):02d}:00-{int(m.group(2)):02d}:00" if m else "24 jam"


def _wa_bandwidth_block(data: Dict) -> str:
    """Angka sama persis dengan tabel 'Ringkasan Trafik Jaringan' di PDF
    (Avg/Peak Download & Upload terpisah, Score, Status), urutan sama."""
    rows = [b for b in (data.get("bandwidth") or []) if b.get("capacity")]
    if not rows:
        return ""
    rows.sort(key=lambda b: b.get("idx", 0))
    lines = [f"📶 *Pemakaian Bandwidth - Jam Kerja {_busy_hours_label()}*"]
    for b in rows:
        st = (b.get("status") or "").upper()
        icon = {"TINGGI": "🔴", "PADAT": "🟠", "STABIL": "🟢"}.get(st, "⚪")
        tag = " (cadangan)" if b.get("is_standby") else ""
        # Puncak di atas kapasitas langganan mustahil secara fisik -> tandai
        # sebagai perlu verifikasi, jangan disajikan seolah kejadian nyata.
        warn = " ⚠️" if b.get("peak_over_capacity") else ""
        lines.append(
            f"\n{icon} *{b['label']}*{tag} - {st or '-'}\n"
            f"   Kapasitas : {b['capacity']:g} Mbps\n"
            f"   Rata-rata : ⬇ {_fmt_mbps(b['avg_down'])} | ⬆ {_fmt_mbps(b['avg_up'])} Mbps\n"
            f"   Puncak    : ⬇ {_fmt_mbps(b['peak_down'])} | ⬆ {_fmt_mbps(b['peak_up'])} Mbps{warn}\n"
            f"   Skor      : {b['score']:.1f}%")
    if any(b.get("peak_over_capacity") for b in rows):
        lines.append("\n⚠️ _Puncak tercatat melebihi kapasitas langganan - "
                     "kemungkinan salah ukur, perlu diverifikasi._")
    return "\n".join(lines)


def _wa_latency_block(data: Dict) -> str:
    """Kualitas koneksi (latensi & packet loss), sama dengan tabel di PDF."""
    rows = [b for b in (data.get("bandwidth") or []) if b.get("latency_avg_ms") is not None]
    if not rows:
        return ""
    rows.sort(key=lambda b: b.get("idx", 0))
    lines = ["📡 *Kualitas Koneksi - Latensi & Packet Loss*"]
    for b in rows:
        q = (b.get("quality") or "").upper()
        icon = {"BAIK": "🟢", "CUKUP": "🟠", "BURUK": "🔴"}.get(q, "⚪")
        tag = " _(via VPN)_" if b.get("vpn_measured") else ""
        lines.append(
            f"\n{icon} *{b['label']}*{tag} - {q or '-'}\n"
            f"   Latensi   : {_fmt_ms(b['latency_avg_ms'])} (P95 {_fmt_ms(b['latency_p95_ms'])})\n"
            f"   Packet loss : {b['loss_avg_pct']:.1f}%")
    notes = []
    if any(b.get("vpn_measured") for b in rows):
        notes.append("_(via VPN) = diukur lewat jalur VPN, mencerminkan kesehatan VPN, "
                     "bukan mutu ISP di lokasi itu._")
    # Saat sebuah link mati, ping ke router di belakangnya juga gagal, jadi
    # downtime ikut terhitung sebagai packet loss. Tanpa catatan ini, satu
    # gangguan terbaca dua kali: sebagai outage DAN sebagai "kualitas buruk".
    if not data.get("coverage_ok") or (data.get("isp_incidents") or []):
        notes.append("_Catatan: jam saat internet/VPN mati ikut terhitung sebagai packet "
                     "loss di tabel ini, jadi angka loss pada lokasi yang sempat mati "
                     "bukan cerminan mutu link saat normal._")
    if notes:
        lines.append("\n" + "\n".join(notes))
    return "\n".join(l for l in lines if l is not None)


def _wa_text(data: Dict, narrative: Optional[str], title: str, pdf_follows: bool = False) -> str:
    du = data.get("isp_uptime_pct")
    pu = data.get("prev_isp_uptime_pct")
    delta = None if (du is None or pu is None) else round(du - pu, 3)
    uptime = _fmt_pct(du)
    if delta is not None:
        arrow = "🔺" if delta > 0 else ("🔻" if delta < 0 else "➖")
        uptime += f" ({arrow} {delta:+.1f} poin vs periode lalu)"
    isp = data.get("isp_incidents") or []
    n_links = len(data.get("isp_links") or [])
    head = (
        f"📊 *{title.upper()}*\n"
        f"🗓️ _{data['period_label']}_\n"
        "━━━━━━━━━━━━━━\n"
    )
    # Peringatan cakupan dipasang DI ATAS angka, supaya tidak terbaca sebagai
    # hasil pemantauan penuh.
    if not data.get("coverage_ok") and data.get("coverage_pct") is not None:
        cov = data["coverage"]
        head += (
            f"⚠️ *Data belum lengkap*\n"
            f"_Pemantauan hanya aktif {data['coverage_pct']:.1f}% periode ini "
            f"({cov['blackout_count']}x jeda, {cov['blackout_seconds']/3600:.1f} jam tidak terpantau). "
            f"Angka di bawah adalah batas bawah — gangguan saat pemantauan mati "
            f"tidak tercatat._\n"
            "━━━━━━━━━━━━━━\n"
        )
    head += (
        f"📈 Uptime internet  : *{uptime}*"
        + (f" _({n_links} link terpantau)_" if n_links else "")
        + f"\n🌐 Internet mati    : *{len(isp)}x*"
        + (f" (total {data['isp_downtime_human']})" if isp else "")
    )
    other = data.get("other_device_incidents") or 0
    if other:
        head += f"\n🔧 Perangkat lain    : *{other}x* _(switch/AP, bukan ISP)_"
    if data.get("clients_total") is not None:
        head += f"\n👥 Klien aktif      : *{data['clients_total']}* _(saat laporan dibuat)_"
    links = data.get("isp_links") or []
    if links:
        head += "\n\n🌐 *Uptime per Link ISP*"
        for l in links:
            ic = "🟢" if (l["uptime_pct"] or 0) >= 99.9 else ("🟠" if (l["uptime_pct"] or 0) >= 99 else "🔴")
            um = l.get("unmonitored_seconds") or 0
            if um:
                ic = "⚪"  # sebagian periode tidak terpantau: uptime-nya hanya batas atas
            head += (f"\n{ic} {l['name']}: {_fmt_pct(l['uptime_pct'])}"
                     + (f" _(tidak terpantau {_fmt_dur(um)})_" if um else ""))
    if isp:
        head += "\n\n🔴 *Detail Internet Mati*"
        for i in isp[:10]:
            up = _fmt_dt_id(i["up_at"]) if i["up_at"] else "masih mati"
            head += (f"\n• {i['name']}: {_fmt_dt_id(i['down_at'])} ➜ {up} "
                     f"({_fmt_dur(i['duration_seconds'])})")
            # Durasi yang sebagian besar jatuh saat pemantauan mati tidak boleh
            # dibaca sebagai lama mati yang terukur.
            if not i.get("duration_certain", True):
                head += (f"\n   ⚠️ _hanya {_fmt_dur(i.get('observed_seconds') or 0)} "
                         f"yang terpantau; sisanya saat pemantauan mati_")
        if len(isp) > 10:
            head += f"\n• _... +{len(isp) - 10} lagi (lihat PDF)_"
        if any(not i.get("duration_certain", True) for i in isp[:10]):
            head += ("\n\n_Durasi bertanda ⚠️ dihitung dari jam yang dilaporkan router, "
                     "bukan dari pemantauan langsung — anggap sebagai perkiraan._")
    else:
        head += "\n\n✅ *Internet mati:* tidak ada"
    routers = data.get("router_incidents") or []
    if routers:
        head += "\n\n📡 *Router Site Tidak Terjangkau*"
        for r in routers:
            up = _fmt_dt_id(r["up_at"]) if r["up_at"] else "masih putus"
            head += (f"\n• {r['name']}: {_fmt_dt_id(r['down_at'])} ➜ {up} "
                     f"({_fmt_dur(r['duration_seconds'])})")
    unmon = data.get("unmonitored") or []
    if unmon:
        head += "\n\n⚪ *Periode Tidak Terpantau* _(status tidak diketahui, bukan berarti hidup)_"
        for u in unmon[:8]:
            to = _fmt_dt_id(u["to"]) if u["to"] else "sekarang"
            who = f"{u['location']} ({u['count']} perangkat)" if u["location"] else "Semua perangkat"
            head += (f"\n• {who}: {_fmt_dt_id(u['from'])} ➜ {to} "
                     f"({_fmt_dur(u['seconds'])}) — {u['reason']}")
        if len(unmon) > 8:
            head += f"\n• _... +{len(unmon) - 8} lagi (lihat PDF)_"
    flap = data.get("flapping_devices") or []
    if flap:
        head += "\n\n🔁 *Perangkat Sering Putus-Nyambung*"
        for x in flap[:5]:
            head += (f"\n• {x['label']}: {x['incidents']}x "
                     f"(total {_fmt_dur(x['downtime_seconds'])})")
        if len(flap) > 5:
            head += f"\n• _... +{len(flap) - 5} lagi (lihat PDF)_"
    bw = _wa_bandwidth_block(data)
    if bw:
        head += "\n\n" + bw
    lat = _wa_latency_block(data)
    if lat:
        head += "\n\n" + lat
    if narrative:
        head += "\n\n━━━━━━━━━━━━━━\n🤖 *Ringkasan AI*\n" + _wa_narrative(narrative)
    head += ("\n\n📎 _PDF lengkap menyusul._" if pdf_follows
             else "\n\n📧 _PDF lengkap dikirim ke email._")
    return head
