#!/usr/bin/env python3
"""
Rekap NOC berkala (mingguan / bulanan) + ringkasan AI, untuk laporan ke atasan.

Sumber data:
- `noc_events` (noc_history.py): uptime %, jumlah insiden, MTTR, perangkat flapping.
- Zabbix (app.build_summary): pemakaian bandwidth per site (rata-rata, puncak, % utilisasi).
- MikroTik DHCP (app._noc_client_counts): jumlah klien aktif — snapshot saat laporan dibuat.

Ringkasan Bahasa Indonesia dibuat oleh Gemini (atau Claude). Kalau tidak ada
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
    from . import noc_history
except ImportError:
    import noc_history

BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", r"C:\Zabbix")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("NOC_REPORT_GEMINI_MODEL", "gemini-3.6-flash").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
NOC_REPORT_MODEL = os.getenv("NOC_REPORT_MODEL", "claude-opus-5").strip()

_BULAN_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
             "Agustus", "September", "Oktober", "November", "Desember"]


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
    ref = ref or datetime.date.today()
    end = datetime.datetime.combine(ref, datetime.time())
    start = end - datetime.timedelta(days=7)
    return start, end


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
    for r in rows:
        peak = max(r.get("peak_download") or 0.0, r.get("peak_upload") or 0.0)
        util = max(r.get("max_peakraw_pct") or 0.0, r.get("max_avg_pct") or 0.0)
        out.append({
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
    names: Dict[str, str] = {}
    try:
        conn = noc_history._connect()
        try:
            for r in conn.execute("SELECT DISTINCT entity_key, entity_name FROM noc_events "
                                  "WHERE kind='device'").fetchall():
                if "isp" in (r["entity_name"] or "").lower():
                    names[r["entity_key"]] = r["entity_name"]
        finally:
            conn.close()
    except Exception:
        logging.exception("NOC report: gagal baca daftar link ISP")
    stats = {d["key"]: d for d in noc_history.get_uptime_stats_range(start, end, kind="device")}
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

    sites = noc_history.get_uptime_stats_range(start, end, kind="site")
    devices = noc_history.get_uptime_stats_range(start, end, kind="device")
    incidents = noc_history.get_downtime_log_range(start, end)
    prev_sites = {s["key"]: s for s in noc_history.get_uptime_stats_range(prev_start, prev_end, kind="site")}

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
         "duration_seconds": i["duration_seconds"], "ongoing": i["ongoing"]}
        for i in isp_dev
    ]
    isp_downtime = sum(i["duration_seconds"] for i in isp_dev)
    isp_links = _isp_link_stats(start, end)
    isp_uptime = _avg_uptime(isp_links)
    prev_isp_uptime = _avg_uptime(_isp_link_stats(prev_start, prev_end))
    other_device_incidents = len(device_incidents) - len(isp_dev)

    up_vals = [s["uptime_pct"] for s in sites if s.get("uptime_pct") is not None]
    avg_uptime = round(sum(up_vals) / len(up_vals), 3) if up_vals else None
    prev_up_vals = [s["uptime_pct"] for s in prev_sites.values() if s.get("uptime_pct") is not None]
    prev_avg_uptime = round(sum(prev_up_vals) / len(prev_up_vals), 3) if prev_up_vals else None
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
        "sites": sites,
        "flapping_devices": flapping,
        "worst_site": worst,
        "bandwidth": bandwidth,
        "clients": clients,
        "clients_total": clients_total,
        "data_incomplete": window_sec < full_sec - 3600,
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
    "lama, dan dampaknya ke pengguna. Kalau tidak ada yang mati, tulis "
    "'- Tidak ada internet mati.' Sebut uptime internet dan bandingkan dengan "
    "periode lalu kalau ada.\n\n"
    "Bandwidth\n"
    "2-3 bullet (awali '- '). Jelaskan bandwidth = kapasitas jalur internet "
    "(seperti lebar jalan). Pakai STATUS beban dari data (STABIL/PADAT/TINGGI) sebagai "
    "patokan - sama dengan PDF - jangan menilai sendiri dari angka puncak. Sebut lokasi "
    "berstatus TINGGI/PADAT dan artinya (internet bisa lambat saat jam sibuk, untuk "
    "berapa pengguna). Puncak sesaat tinggi tapi status STABIL = hanya lonjakan singkat. "
    "Sebut juga lokasi yang masih lega. Kalau puncak lebih dari 100%, jelaskan "
    "itu lonjakan sesaat melebihi kapasitas.\n\n"
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
    if data.get("data_incomplete"):
        lines.append("CATATAN PENTING: pencatatan periode ini belum penuh (baru sebagian), "
                     "angka insiden/downtime kemungkinan lebih rendah dari kenyataan — sebutkan ini.")

    ct = data.get("clients_total")
    if ct is not None:
        lines.append(f"\nJumlah klien/pengguna aktif (snapshot saat laporan dibuat): {ct} total.")
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
            lines.append(f"- {i['name']}: {i['down_at']} -> {up}, {_fmt_dur(i['duration_seconds'])}")
        lines.append("(Sebutkan kejadian ISP mati di Poin Penting lengkap dengan "
                     "nama ISP/lokasi, tanggal & jam, dan durasinya.)")
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
    if GEMINI_API_KEY:
        out = _narrative_gemini(prompt)
        if out:
            return out
    if ANTHROPIC_API_KEY:
        out = _narrative_anthropic(prompt)
        if out:
            return out
    logging.info("NOC report: tidak ada GEMINI_API_KEY / ANTHROPIC_API_KEY — ringkasan AI dilewati")
    return None


def _narrative_gemini(prompt: str) -> Optional[str]:
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{GEMINI_MODEL}:generateContent")
    body = {
        "systemInstruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 4096,
            "thinkingConfig": {"thinkingLevel": "medium"},
        },
    }
    try:
        r = requests.post(url, params={"key": GEMINI_API_KEY}, json=body, timeout=60)
        if r.status_code == 400 and "thinkingConfig" in body["generationConfig"]:
            body["generationConfig"].pop("thinkingConfig", None)
            r = requests.post(url, params={"key": GEMINI_API_KEY}, json=body, timeout=60)
        if r.status_code >= 400:
            logging.warning("NOC report: Gemini HTTP %s %s", r.status_code, r.text[:500])
            return None
        payload = r.json()
        cands = payload.get("candidates") or []
        if not cands:
            logging.warning("NOC report: Gemini tanpa candidates — %s", str(payload)[:500])
            return None
        c0 = cands[0]
        text = "".join(p.get("text", "") for p in c0.get("content", {}).get("parts", []) or []).strip()
        if not text:
            logging.warning("NOC report: Gemini teks kosong (finishReason=%s)", c0.get("finishReason"))
            return None
        return text
    except Exception:
        logging.exception("NOC report: gagal membuat ringkasan (Gemini)")
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
    rows = [b for b in (data.get("bandwidth") or []) if b.get("capacity")]
    if not rows:
        return ""
    lines = [f"📶 *Pemakaian Bandwidth - Jam Kerja {_busy_hours_label()}*",
             "_Bandwidth = kapasitas jalur internet (seperti lebar jalan). "
             "Rata-rata = pemakaian sehari-hari, Puncak = lonjakan tertinggi sesaat. "
             "Status sama dengan PDF: dinilai dari pemakaian yang berlangsung lama, "
             "jadi lonjakan sesaat belum tentu berarti jalur penuh terus._"]
    for b in rows[:8]:
        cap = b["capacity"]
        u = b["util_pct"]
        st = (b.get("status") or "").upper()
        icon = {"TINGGI": "🔴", "PADAT": "🟠", "STABIL": "🟢"}.get(st, "⚪")
        ket = st or "-"
        tag = " (cadangan)" if b.get("is_standby") else ""
        avg_pct = round(100.0 * b["avg_mbps"] / cap) if cap else 0
        lines.append(
            f"\n{icon} *{b['label']}*{tag} - {ket}\n"
            f"   Kapasitas : {cap:g} Mbps\n"
            f"   Rata-rata : {b['avg_mbps']:g} Mbps ({avg_pct}%)\n"
            f"   Puncak    : {b['peak_mbps']:g} Mbps ({round(u)}%)")
    return "\n".join(lines)


def _wa_text(data: Dict, narrative: Optional[str], title: str, pdf_follows: bool = False) -> str:
    du = data.get("isp_uptime_pct")
    pu = data.get("prev_isp_uptime_pct")
    delta = None if (du is None or pu is None) else round(du - pu, 3)
    uptime = "-" if du is None else f"{du}%"
    if delta is not None:
        arrow = "🔺" if delta > 0 else ("🔻" if delta < 0 else "➖")
        uptime += f" ({arrow} {delta:+.2f} poin vs periode lalu)"
    isp = data.get("isp_incidents") or []
    head = (
        f"📊 *{title.upper()}*\n"
        f"🗓️ _{data['period_label']}_\n"
        "━━━━━━━━━━━━━━\n"
        f"📈 Uptime internet  : *{uptime}*\n"
        f"🌐 Internet mati    : *{len(isp)}x*"
        + (f" (total {data['isp_downtime_human']})" if isp else "")
    )
    if data.get("clients_total") is not None:
        head += f"\n👥 Klien aktif      : *{data['clients_total']}*"
    links = data.get("isp_links") or []
    if links:
        head += "\n\n🌐 *Uptime per Link ISP*"
        for l in links:
            ic = "🟢" if (l["uptime_pct"] or 0) >= 99.9 else ("🟠" if (l["uptime_pct"] or 0) >= 99 else "🔴")
            head += f"\n{ic} {l['name']}: {l['uptime_pct']}%"
    if isp:
        head += "\n\n🔴 *Detail Internet Mati*"
        for i in isp[:10]:
            up = i["up_at"][5:16] if i["up_at"] else "masih mati"
            head += f"\n• {i['name']}: {i['down_at'][5:16]} ➜ {up} ({_fmt_dur(i['duration_seconds'])})"
        if len(isp) > 10:
            head += f"\n• _... +{len(isp) - 10} lagi (lihat PDF)_"
    else:
        head += "\n\n✅ *Internet mati:* tidak ada"
    bw = _wa_bandwidth_block(data)
    if bw:
        head += "\n\n" + bw
    if narrative:
        head += "\n\n━━━━━━━━━━━━━━\n🤖 *Ringkasan AI*\n" + _wa_narrative(narrative)
    head += ("\n\n📎 _PDF lengkap menyusul._" if pdf_follows
             else "\n\n📧 _PDF lengkap dikirim ke email._")
    return head
