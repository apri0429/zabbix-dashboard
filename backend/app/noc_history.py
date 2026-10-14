#!/usr/bin/env python3
"""
Log riwayat status site & perangkat NOC (kapan down, kapan up, berapa lama).

Netwatch MikroTik & snapshot Zabbix cuma nyimpen status TERKINI, nggak ada
riwayat perubahan. Modul ini nyatet tiap kali status suatu entity (site atau
perangkat Netwatch) berubah, ke SQLite lokal, lewat polling berkala (lihat
`_poll_noc_history` di app.py yang dijadwalkan via APScheduler).

Keterbatasan yang perlu disadari:
- Riwayat cuma mulai tercatat sejak fitur ini di-deploy & backend jalan —
  nggak ada data sebelum itu.
- Resolusi waktu segranular interval polling-nya (lihat NOC_HISTORY_POLL_SECONDS
  di app.py), bukan real-time persis detik ke detik.
- Restart singkat (jeda <= MONITOR_GAP_THRESHOLD_SECONDS) tidak memutus event:
  polling berikutnya meneruskannya. Jeda lebih lama dicatat sebagai blackout
  dan event direkonsiliasi (lihat reconcile_after_gap).

Buat Log Insiden & statistik supaya jelas & akurat (bukan raw noc_events mentah),
dua hal berikut diterapkan tiap kali dibaca (lihat _clean_incident_rows):
- Kedipan sesaat (mis. sempat kejawab 1 ping pas baru boot) yang cuma bertahan
  <= FLAP_MERGE_GAP_SECONDS sebelum DOWN lagi DIGABUNG ke satu insiden, supaya
  insiden yang sebenarnya cuma satu (misalnya mati dari jam 4 sore) tidak
  terpotong-potong jadi banyak baris pendek gara-gara sempat "UP" sesaat.
- Sesudah digabung, insiden yang SUDAH SELESAI dan durasinya masih di bawah
  MIN_INCIDENT_SECONDS (default 15 menit, env NOC_MIN_INCIDENT_SECONDS) tidak
  ditampilkan/dihitung sebagai insiden.
  Insiden yang masih berlangsung tidak pernah dibuang oleh aturan ini.
"""

import ipaddress
import os
import sqlite3
import datetime
import threading
from typing import Dict, List, Optional, Tuple

BASE_OUTPUT_DIR = os.getenv("BASE_OUTPUT_DIR", r"C:\Zabbix")
DB_PATH = os.path.join(BASE_OUTPUT_DIR, "noc_history.db")

_lock = threading.Lock()
_initialized = False


def _connect() -> sqlite3.Connection:
    os.makedirs(BASE_OUTPUT_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        conn = _connect()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS noc_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,           -- 'site' | 'device'
                    entity_key TEXT NOT NULL,     -- id unik (label / router+host)
                    entity_name TEXT NOT NULL,    -- nama buat ditampilkan
                    state TEXT NOT NULL,          -- UP | WARN | DOWN | UNKNOWN
                    started_at TEXT NOT NULL,     -- ISO timestamp mulai state ini
                    ended_at TEXT                 -- ISO timestamp state ini berakhir (NULL = masih berlangsung)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_noc_events_open
                ON noc_events (entity_key, ended_at)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_noc_events_started
                ON noc_events (started_at)
            """)
            # Sampel metrik berkala (buat sparkline tren). Ring buffer: baris lama
            # dibuang tiap kali nyimpen (lihat record_samples), jadi ukurannya tetap.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS noc_samples (
                    entity_key TEXT NOT NULL,
                    ts TEXT NOT NULL,
                    latency_ms REAL,
                    loss_pct REAL,
                    state TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_noc_samples_key_ts
                ON noc_samples (entity_key, ts)
            """)
            # Rentang waktu saat pemantauan MATI (backend down / server dimatikan).
            # Dipakai supaya Log Insiden jujur & perhitungan uptime tidak menghitung
            # jam-jam yang memang tidak terpantau.
            conn.execute("""
                CREATE TABLE IF NOT EXISTS noc_blackouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,   -- aktivitas polling terakhir sebelum mati
                    ended_at TEXT NOT NULL,     -- saat pemantauan hidup lagi
                    seconds INTEGER
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_noc_blackouts_started
                ON noc_blackouts (started_at)
            """)
            conn.commit()
        finally:
            conn.close()
        _initialized = True


_FMT = "%Y-%m-%d %H:%M:%S"
# Timestamp disimpan "YYYY-MM-DD HH:MM:SS"; fromisoformat ±10x lebih cepat dari strptime
# (penting: dipanggil puluhan ribu kali saat membaca riwayat panjang).
_dt = datetime.datetime.fromisoformat


def _now_iso() -> str:
    return datetime.datetime.now().strftime(_FMT)


# Jarak tanpa polling yang dianggap "pemantauan mati" (bukan sekadar restart cepat).
MONITOR_GAP_THRESHOLD_SECONDS = 300

# Blackout sependek ini masih boleh "disambung": perangkat yang DOWN sebelum dan
# sesudahnya dianggap DOWN terus, supaya satu gangguan nyata tidak terpecah hanya
# karena backend sempat restart. Lebih lama dari ini, penyambungan TIDAK dilakukan:
# kita cuma tahu perangkat DOWN di dua titik, bukan bahwa ia DOWN sepanjang jeda —
# dulu asumsi itu melahirkan insiden 25 hari padahal 23 hari di antaranya buta.
GAP_CARRY_FORWARD_MAX_SECONDS = int(os.getenv("NOC_GAP_CARRY_FORWARD_SECONDS", "900"))


def _last_activity_iso(conn) -> Optional[str]:
    """Timestamp terakhir kali polling terbukti aktif — sampel metrik terbaru,
    fallback ke event terbaru."""
    row = conn.execute("SELECT MAX(ts) AS t FROM noc_samples").fetchone()
    if row and row["t"]:
        return row["t"]
    row = conn.execute(
        "SELECT MAX(t) AS t FROM ("
        "SELECT MAX(started_at) AS t FROM noc_events "
        "UNION ALL SELECT MAX(ended_at) FROM noc_events)"
    ).fetchone()
    return row["t"] if row and row["t"] else None


def record_monitoring_gap(reference: Optional[str] = None) -> Optional[Dict]:
    """Kalau jarak dari aktivitas polling terakhir ke `reference` (default sekarang)
    melebihi MONITOR_GAP_THRESHOLD_SECONDS, catat sebagai blackout pemantauan.
    Mengembalikan dict blackout bila tercatat, None kalau tidak ada gap berarti."""
    init_db()
    now_dt = datetime.datetime.now()
    ref_dt = _dt(reference) if reference else now_dt
    with _lock:
        conn = _connect()
        try:
            last = _last_activity_iso(conn)
            if not last:
                return None
            last_dt = _dt(last)
            gap = (ref_dt - last_dt).total_seconds()
            if gap <= MONITOR_GAP_THRESHOLD_SECONDS:
                return None
            # Sudah ada blackout yang menutup rentang ini? (mis. dipanggil 2x saat startup)
            dup = conn.execute(
                "SELECT 1 FROM noc_blackouts WHERE ended_at >= ? LIMIT 1", (last,)
            ).fetchone()
            if dup:
                return None
            ended = ref_dt.strftime(_FMT)
            conn.execute(
                "INSERT INTO noc_blackouts (started_at, ended_at, seconds) VALUES (?, ?, ?)",
                (last, ended, int(gap)),
            )
            conn.commit()
            return {"started_at": last, "ended_at": ended, "seconds": int(gap)}
        finally:
            conn.close()


def _safe_parse(ts: Optional[str]) -> Optional[datetime.datetime]:
    if not ts:
        return None
    try:
        return _dt(ts)
    except (ValueError, TypeError):
        return None


def reconcile_after_gap(entities: List[Dict], gap_start: str):
    """Dipanggil sekali sesudah blackout, dengan status terkini tiap entity.
    `entities` boleh menyertakan `since` opsional (mis. dari MikroTik Netwatch,
    yang terus jalan sendiri walau backend kita mati) -- kapan status SEKARANG
    persis mulai.

    - state SAMA dgn sebelum mati:
        * jeda <= GAP_CARRY_FORWARD_MAX_SECONDS (restart singkat), atau state UP
          → event lama DITERUSKAN.
        * jeda panjang → event lama DITUTUP di `gap_start`, lalu dibuka event baru
          di `since` (kalau router melaporkan status sekarang mulai sesudah jeda)
          atau di sekarang. Alasannya: kita hanya tahu perangkat DOWN di dua titik,
          bukan bahwa ia DOWN sepanjang jeda. Menyambungkannya membuat durasi
          insiden menelan lama blackout (pernah menghasilkan insiden 25 hari
          padahal 23 hari di antaranya tidak terpantau).
    - state BEDA & ada `since` yang masuk akal (antara mulainya event lama dan
      sekarang) → dipakai persis sebagai titik transisi, bukan tebakan. Jadi
      kalau perangkat mati jam 3 sore lalu backend baru nyala lagi jam 3 pagi,
      insidennya tercatat mulai jam 3 sore itu -- bukan jam 3 pagi.
    - state BEDA tanpa `since` yang bisa dipakai → event lama ditutup di
      `gap_start` (kita tak tahu persisnya), event baru dibuka sekarang.
    - entity yang hilang → event lama ditutup di `gap_start`.
    """
    init_db()
    now = _now_iso()
    now_dt = _dt(now)
    gap_start_dt = _safe_parse(gap_start)
    gap_seconds = ((now_dt - gap_start_dt).total_seconds()
                   if gap_start_dt else float("inf"))
    cur_by_key = {e["key"]: e for e in entities}
    with _lock:
        conn = _connect()
        try:
            open_rows = conn.execute(
                "SELECT id, entity_key, entity_name, state, started_at FROM noc_events WHERE ended_at IS NULL"
            ).fetchall()
            seen = set()
            for r in open_rows:
                seen.add(r["entity_key"])
                cur = cur_by_key.get(r["entity_key"])
                if cur is None:
                    conn.execute(
                        "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE id = ?",
                        (gap_start, r["id"]),
                    )
                    continue
                if cur["state"] == r["state"]:
                    if r["entity_name"] != cur["name"]:
                        conn.execute("UPDATE noc_events SET entity_name = ? WHERE id = ?", (cur["name"], r["id"]))
                    # Status sama di dua sisi jeda. Menyambungkan event hanya sah
                    # kalau jedanya pendek; untuk jeda panjang kita tidak punya
                    # bukti perangkat DOWN terus-menerus, dan menyambungkannya
                    # membuat durasi insiden ikut menelan lama blackout.
                    if (r["state"] == "UP"
                            or gap_seconds <= GAP_CARRY_FORWARD_MAX_SECONDS):
                        continue
                    since_dt = _safe_parse(cur.get("since"))
                    if since_dt and gap_start_dt and gap_start_dt < since_dt <= now_dt:
                        # Router melaporkan status sekarang baru mulai SESUDAH
                        # pemantauan mati -> perangkat sempat pulih di tengah jeda.
                        new_started = since_dt.strftime(_FMT)
                    else:
                        # Tak ada bukti sama sekali: yang bisa dipertanggungjawabkan
                        # hanyalah "DOWN lagi saat pemantauan hidup kembali".
                        new_started = now
                    conn.execute(
                        "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE id = ?",
                        (gap_start, r["id"]),
                    )
                    conn.execute(
                        "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (cur["kind"], cur["key"], cur["name"], cur["state"], new_started),
                    )
                    continue

                # Transisi terjadi entah kapan selama blackout. Kalau ada `since`
                # yang masuk akal (setelah event lama mulai, sebelum sekarang),
                # pakai itu -- jauh lebih akurat daripada nebak "baru saja".
                transition, new_started = gap_start, now
                since_dt = _safe_parse(cur.get("since"))
                row_started_dt = _safe_parse(r["started_at"])
                if since_dt and row_started_dt and row_started_dt <= since_dt <= now_dt:
                    exact = since_dt.strftime(_FMT)
                    transition, new_started = exact, exact

                conn.execute(
                    "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE id = ?",
                    (transition, r["id"]),
                )
                conn.execute(
                    "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) VALUES (?, ?, ?, ?, ?)",
                    (cur["kind"], cur["key"], cur["name"], cur["state"], new_started),
                )
            for e in entities:
                if e["key"] not in seen:
                    started = now
                    since_dt = _safe_parse(e.get("since"))
                    if since_dt and since_dt <= now_dt:
                        started = since_dt.strftime(_FMT)
                    conn.execute(
                        "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) VALUES (?, ?, ?, ?, ?)",
                        (e["kind"], e["key"], e["name"], e["state"], started),
                    )
            conn.commit()
        finally:
            conn.close()


def _cutoff_iso(days: int) -> str:
    """Batas awal window `days` hari ke belakang; days <= 0 = seluruh riwayat."""
    if days <= 0:
        return "0000-00-00 00:00:00"
    return (datetime.datetime.now() - datetime.timedelta(days=days)).strftime(_FMT)


def get_blackouts(days: int = 7) -> List[Dict]:
    init_db()
    cutoff = _cutoff_iso(days)
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT started_at, ended_at, seconds FROM noc_blackouts "
            "WHERE ended_at >= ? ORDER BY started_at DESC", (cutoff,)
        ).fetchall()
    finally:
        conn.close()
    return [{"started_at": r["started_at"], "ended_at": r["ended_at"],
             "seconds": r["seconds"]} for r in rows]


def get_blackouts_range(start_dt: datetime.datetime,
                        end_dt: datetime.datetime) -> List[Dict]:
    """Blackout pemantauan yang menyentuh window [start_dt, end_dt), masing-masing
    sudah dipotong di batas window. `seconds` = lama blackout DI DALAM window."""
    init_db()
    lo = start_dt.strftime(_FMT)
    hi = end_dt.strftime(_FMT)
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT started_at, ended_at, seconds FROM noc_blackouts "
            "WHERE started_at < ? AND ended_at >= ? ORDER BY started_at ASC",
            (hi, lo),
        ).fetchall()
    finally:
        conn.close()

    # Potong di batas window dulu.
    clipped = []
    for r in rows:
        s = max(_dt(r["started_at"]), start_dt)
        e = min(_dt(r["ended_at"]), end_dt)
        if (e - s).total_seconds() > 0:
            clipped.append((s, e))

    # Gabung rentang yang bertumpuk/duplikat. Tabel noc_blackouts bisa memuat
    # baris kembar untuk rentang yang sama (mis. record_monitoring_gap terpanggil
    # dua kali saat startup); kalau dijumlah apa adanya, rentang itu terhitung
    # ganda dan cakupan pemantauan dilaporkan lebih buruk dari kenyataan.
    clipped.sort(key=lambda p: p[0])
    merged: List[Tuple[datetime.datetime, datetime.datetime]] = []
    for s, e in clipped:
        if merged and s <= merged[-1][1]:
            if e > merged[-1][1]:
                merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    return [{"started_at": s.strftime(_FMT),
             "ended_at": e.strftime(_FMT),
             "seconds": int((e - s).total_seconds())}
            for s, e in merged]


def get_coverage(start_dt: datetime.datetime, end_dt: datetime.datetime) -> Dict:
    """Seberapa banyak window [start_dt, end_dt) benar-benar terpantau.

    Dipakai laporan supaya uptime / jumlah insiden tidak disajikan seolah hasil
    pemantauan penuh padahal backend sempat mati. Insiden yang mulai DAN selesai
    di dalam blackout hilang permanen, jadi angka insiden pada periode dengan
    cakupan rendah hanya batas bawah."""
    now_dt = datetime.datetime.now()
    win_end = min(end_dt, now_dt)
    window_seconds = max(0.0, (win_end - start_dt).total_seconds())
    blackouts = get_blackouts_range(start_dt, win_end) if window_seconds else []
    # get_blackouts_range sudah menggabungkan rentang yang bertumpuk/duplikat,
    # jadi penjumlahan di sini tidak menghitung rentang yang sama dua kali.
    blackout_seconds = sum(b["seconds"] for b in blackouts)
    blackout_seconds = min(blackout_seconds, window_seconds)
    monitored = max(0.0, window_seconds - blackout_seconds)
    pct = round(100.0 * monitored / window_seconds, 1) if window_seconds else None
    return {
        "window_seconds": int(window_seconds),
        "monitored_seconds": int(monitored),
        "blackout_seconds": int(blackout_seconds),
        "coverage_pct": pct,
        "blackouts": blackouts,
        "blackout_count": len(blackouts),
    }


def record_snapshot(entities: List[Dict]):
    """Bandingkan status tiap entity sekarang dengan event terbuka terakhirnya.
    entities: [{"kind": "site"|"device", "key": str, "name": str, "state": str}, ...]
    """
    init_db()
    now = _now_iso()
    transitions = []
    with _lock:
        conn = _connect()
        try:
            for e in entities:
                kind, key, name, state = e["kind"], e["key"], e["name"], e["state"]
                row = conn.execute(
                    "SELECT id, state, entity_name FROM noc_events "
                    "WHERE entity_key = ? AND ended_at IS NULL "
                    "ORDER BY id DESC LIMIT 1",
                    (key,),
                ).fetchone()

                if row is None:
                    # Belum pernah tercatat -> buka event pertama
                    conn.execute(
                        "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (kind, key, name, state, now),
                    )
                    continue

                if row["state"] == state:
                    # Masih di state yang sama; sinkronkan nama kalau berubah (mis. rename di Netwatch)
                    if row["entity_name"] != name:
                        conn.execute("UPDATE noc_events SET entity_name = ? WHERE id = ?", (name, row["id"]))
                    continue

                # State berubah -> tutup event lama, buka event baru
                old_state = row["state"]
                conn.execute("UPDATE noc_events SET ended_at = ? WHERE id = ?", (now, row["id"]))
                conn.execute(
                    "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (kind, key, name, state, now),
                )
                if state == "DOWN" or old_state == "DOWN":
                    transitions.append({
                        "kind": kind,
                        "key": key,
                        "name": name,
                        "old_state": old_state,
                        "new_state": state,
                        "changed_at": now,
                    })
            conn.commit()
        finally:
            conn.close()
    return transitions


SAMPLE_RETENTION_HOURS = 4


def record_samples(samples: List[Dict]):
    """Simpan satu titik metrik per entity, lalu buang sampel yang lebih tua dari
    SAMPLE_RETENTION_HOURS supaya tabel nggak tumbuh terus.
    samples: [{"key": str, "latency_ms": float|None, "loss_pct": float|None, "state": str}, ...]
    """
    if not samples:
        return
    init_db()
    now = _now_iso()
    cutoff = (datetime.datetime.now() - datetime.timedelta(hours=SAMPLE_RETENTION_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _connect()
        try:
            conn.executemany(
                "INSERT INTO noc_samples (entity_key, ts, latency_ms, loss_pct, state) VALUES (?, ?, ?, ?, ?)",
                [(s["key"], now, s.get("latency_ms"), s.get("loss_pct"), s.get("state")) for s in samples],
            )
            conn.execute("DELETE FROM noc_samples WHERE ts < ?", (cutoff,))
            conn.commit()
        finally:
            conn.close()


def get_trend(minutes: int = 120, max_points: int = 120) -> Dict[str, List[Dict]]:
    """Deret sampel per entity_key untuk N menit terakhir (buat sparkline)."""
    init_db()
    cutoff = (datetime.datetime.now() - datetime.timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT entity_key, ts, latency_ms, loss_pct, state FROM noc_samples "
            "WHERE ts >= ? ORDER BY ts ASC",
            (cutoff,),
        ).fetchall()
    finally:
        conn.close()

    by_key: Dict[str, List[Dict]] = {}
    for r in rows:
        by_key.setdefault(r["entity_key"], []).append({
            "ts": r["ts"],
            "latency_ms": r["latency_ms"],
            "loss_pct": r["loss_pct"],
            "state": r["state"],
        })
    # Turunkan resolusi kalau kepanjangan (ambil merata max_points titik)
    for k, seq in by_key.items():
        if len(seq) > max_points:
            step = len(seq) / max_points
            by_key[k] = [seq[int(i * step)] for i in range(max_points)]
    return by_key


# Kejadian DOWN yang sudah selesai & durasinya di bawah ini tidak dicatat sebagai
# insiden (Log Insiden, halaman Catatan ISP/Perangkat, statistik uptime, dan laporan):
# gangguan singkat dianggap bukan masalah yang perlu ditindaklanjuti. Data mentah di
# noc_events tetap utuh, jadi ambang ini bisa diubah kapan saja tanpa kehilangan data.
# Yang masih berlangsung tidak pernah dibuang oleh ambang ini, berapa pun umurnya
# sejauh ini, karena kita belum tahu itu bakal jadi insiden panjang atau bukan.
# Catatan: downtime dari insiden yang dibuang juga tidak ikut dihitung di uptime %.
def _env_seconds(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


MIN_INCIDENT_SECONDS = _env_seconds("NOC_MIN_INCIDENT_SECONDS", 900)

# Ambang khusus LAPORAN (PDF & rekap WA). Default sama dengan dashboard.
REPORT_MIN_INCIDENT_SECONDS = _env_seconds("NOC_REPORT_MIN_INCIDENT_SECONDS", MIN_INCIDENT_SECONDS)

# Dua kejadian DOWN berurutan milik entity yang sama, kalau jeda UP di antaranya
# lebih pendek dari ini, dianggap satu insiden yang sama yang cuma sempat "kedip"
# nyala sebentar (mis. balas 1 ping pas baru boot) — digabung jadi satu supaya
# durasi mati sebenarnya (dari kejadian pertama sampai bener-bener pulih) tidak
# terpotong-potong & log-nya akurat.
FLAP_MERGE_GAP_SECONDS = 90


def _merge_flaps(rows: List[sqlite3.Row]) -> List[Dict]:
    """Gabung kejadian DOWN berurutan milik entity yang sama kalau jeda UP di
    antaranya <= FLAP_MERGE_GAP_SECONDS (dianggap kedip sesaat, bukan pulih
    beneran)."""
    by_key: Dict[str, List[Dict]] = {}
    for r in rows:
        by_key.setdefault(r["entity_key"], []).append(dict(r))

    merged: List[Dict] = []
    for evs in by_key.values():
        evs.sort(key=lambda e: e["started_at"])
        cur = None
        for e in evs:
            if cur is None:
                cur = e
                continue
            if cur["ended_at"] is None:
                # cur masih berlangsung (normalnya cuma satu open event per entity)
                continue
            gap = (_dt(e["started_at"])
                   - _dt(cur["ended_at"])).total_seconds()
            if gap <= FLAP_MERGE_GAP_SECONDS:
                cur["ended_at"] = e["ended_at"]
                cur["entity_name"] = e["entity_name"]
            else:
                merged.append(cur)
                cur = e
        if cur is not None:
            merged.append(cur)
    merged.sort(key=lambda e: e["started_at"])
    return merged


def _drop_short_incidents(rows: List[Dict], min_seconds: int = MIN_INCIDENT_SECONDS) -> List[Dict]:
    """Buang insiden yang sudah SELESAI & durasinya di bawah ambang. Yang masih
    berlangsung selalu dipertahankan."""
    out = []
    for r in rows:
        if r["ended_at"] is None:
            out.append(r)
            continue
        started = _dt(r["started_at"])
        ended = _dt(r["ended_at"])
        if (ended - started).total_seconds() >= min_seconds:
            out.append(r)
    return out


def _clean_incident_rows(rows: List[sqlite3.Row],
                         min_seconds: int = MIN_INCIDENT_SECONDS) -> List[Dict]:
    """Pipeline standar buat log/statistik: gabung kedipan lalu buang yang masih
    terlalu pendek. Dipakai di semua fungsi baca supaya Log Insiden & statistik
    konsisten — sesaat/noise tidak ikut dihitung, insiden nyata tidak terpotong."""
    return _drop_short_incidents(_merge_flaps(rows), min_seconds)


def get_uptime_stats(kind: Optional[str] = None, days: int = 7) -> List[Dict]:
    """Ringkasan keandalan per entity dari noc_events: uptime %, jumlah insiden
    DOWN, total downtime, dan MTTR. Window = `days` hari terakhir."""
    now_dt = datetime.datetime.now()
    return get_uptime_stats_range(now_dt - datetime.timedelta(days=days), now_dt, kind=kind)


def get_uptime_stats_range(start_dt: datetime.datetime, end_dt: datetime.datetime,
                           kind: Optional[str] = None,
                           min_seconds: int = MIN_INCIDENT_SECONDS) -> List[Dict]:
    """Sama seperti get_uptime_stats tapi window-nya eksplisit [start_dt, end_dt).
    Insiden yang melewati batas window dipotong di batas itu. `end_dt` di masa
    depan otomatis di-clamp ke sekarang untuk insiden yang masih berlangsung."""
    init_db()
    now_dt = datetime.datetime.now()
    win_start = start_dt
    win_end = min(end_dt, now_dt)
    window_seconds = max(0.0, (win_end - win_start).total_seconds())
    # Catatan: window TIDAK dikurangi durasi blackout. Down selama blackout hanya
    # terhitung bila terbukti (jam `since` dari router/Zabbix, lihat
    # reconcile_after_gap); sisanya dianggap UP. Jadi uptime pada periode dengan
    # cakupan rendah (get_coverage) adalah batas atas, bukan angka pasti.
    lo = win_start.strftime("%Y-%m-%d %H:%M:%S")
    hi = win_end.strftime("%Y-%m-%d %H:%M:%S")

    conn = _connect()
    try:
        q = (
            "SELECT kind, entity_key, entity_name, state, started_at, ended_at "
            "FROM noc_events WHERE state = 'DOWN' AND started_at < ? "
            "AND (ended_at IS NULL OR ended_at >= ?)"
        )
        params: List = [hi, lo]
        if kind:
            q += " AND kind = ?"
            params.append(kind)
        rows = conn.execute(q, params).fetchall()
    finally:
        conn.close()
    rows = _clean_incident_rows(rows, min_seconds)

    agg: Dict[str, Dict] = {}
    for r in rows:
        started = _dt(r["started_at"])
        ended = (_dt(r["ended_at"])
                 if r["ended_at"] else now_dt)
        clipped_start = max(started, win_start)
        clipped_end = min(ended, win_end)
        down_sec = max(0.0, (clipped_end - clipped_start).total_seconds())
        full_sec = max(0.0, (ended - started).total_seconds())

        a = agg.setdefault(r["entity_key"], {
            "kind": r["kind"], "key": r["entity_key"], "name": r["entity_name"],
            "incidents": 0, "downtime_seconds": 0.0,
            "_resolved_seconds": 0.0, "_resolved_count": 0, "ongoing": False,
        })
        a["name"] = r["entity_name"]
        a["incidents"] += 1
        a["downtime_seconds"] += down_sec
        if r["ended_at"]:
            a["_resolved_seconds"] += full_sec
            a["_resolved_count"] += 1
        else:
            a["ongoing"] = True

    out = []
    for a in agg.values():
        dt_sec = min(a["downtime_seconds"], window_seconds)
        uptime_pct = round(100.0 * (1.0 - dt_sec / window_seconds), 3) if window_seconds else None
        mttr = int(a["_resolved_seconds"] / a["_resolved_count"]) if a["_resolved_count"] else None
        out.append({
            "kind": a["kind"],
            "key": a["key"],
            "name": a["name"],
            "incidents": a["incidents"],
            "downtime_seconds": int(dt_sec),
            "uptime_pct": uptime_pct,
            "mttr_seconds": mttr,
            "ongoing": a["ongoing"],
        })
    out.sort(key=lambda x: (x["uptime_pct"] if x["uptime_pct"] is not None else 100.0, -x["incidents"]))
    return out


def get_downtime_log_range(start_dt: datetime.datetime, end_dt: datetime.datetime,
                           kind: Optional[str] = None, limit: int = 2000,
                           min_seconds: int = MIN_INCIDENT_SECONDS) -> List[Dict]:
    """Kejadian DOWN yang menyentuh window [start_dt, end_dt)."""
    init_db()
    now_dt = datetime.datetime.now()
    lo = start_dt.strftime("%Y-%m-%d %H:%M:%S")
    hi = end_dt.strftime("%Y-%m-%d %H:%M:%S")
    conn = _connect()
    try:
        q = (
            "SELECT kind, entity_key, entity_name, started_at, ended_at "
            "FROM noc_events WHERE state = 'DOWN' AND started_at < ? "
            "AND (ended_at IS NULL OR ended_at >= ?)"
        )
        params: List = [hi, lo]
        if kind:
            q += " AND kind = ?"
            params.append(kind)
        q += " ORDER BY started_at ASC LIMIT ?"
        params.append(limit)
        rows = conn.execute(q, params).fetchall()
    finally:
        conn.close()
    rows = _clean_incident_rows(rows, min_seconds)

    # Rentang blackout dipakai untuk menandai bagian durasi yang sebenarnya tidak
    # terpantau. Perlu, karena riwayat lama bisa memuat insiden yang durasinya
    # sudah menelan blackout (lihat reconcile_after_gap) dan tidak bisa dikoreksi
    # ke belakang — minimal pembaca tahu bagian mana yang tidak terbukti.
    # Rentangnya diambil sepanjang insiden TERPANJANG, bukan sebatas window
    # laporan: sebuah insiden bisa mulai jauh sebelum window dan blackout yang
    # menggelembungkan durasinya pun ada di luar window.
    bo = []
    if rows:
        _spans = []
        for r in rows:
            _s = _dt(r["started_at"])
            _e = (_dt(r["ended_at"])
                  if r["ended_at"] else now_dt)
            _spans.append((_s, _e))
        bo = [(_dt(b["started_at"]),
               _dt(b["ended_at"]))
              for b in get_blackouts_range(min(s for s, _ in _spans),
                                           max(e for _, e in _spans))]

    out = []
    for r in rows:
        started = _dt(r["started_at"])
        if r["ended_at"]:
            ended = _dt(r["ended_at"])
            ongoing = False
        else:
            ended = now_dt
            ongoing = True
        dur = int((ended - started).total_seconds())
        unmon = 0
        for bs, be in bo:
            ov = (min(ended, be) - max(started, bs)).total_seconds()
            if ov > 0:
                unmon += int(ov)
        unmon = min(unmon, dur)
        out.append({
            "kind": r["kind"],
            "key": r["entity_key"],
            "name": r["entity_name"],
            "down_at": r["started_at"],
            "up_at": r["ended_at"],
            "duration_seconds": dur,
            # Bagian durasi yang jatuh pada saat pemantauan mati, dan bagian yang
            # benar-benar terbukti terpantau.
            "unmonitored_seconds": unmon,
            "observed_seconds": max(0, dur - unmon),
            "duration_certain": unmon == 0,
            "ongoing": ongoing,
        })
    return out


ISP_OVERVIEW_MAX_INCIDENTS = 500


def _is_isp_key(key: str) -> bool:
    """entity_key perangkat ISP: host-nya IP publik (mis. 8.8.8.8 / 1.1.1.1 di
    Netwatch), bukan perangkat LAN. Format key: device:<router>:<host>."""
    if not key.startswith("device:") or ":" not in key[7:]:
        return False
    try:
        return not ipaddress.ip_address(key.rsplit(":", 1)[1]).is_private
    except ValueError:
        return False


def _is_device_key(key: str) -> bool:
    """entity_key perangkat LAN (AP, switch, dll.): host-nya IP privat. Entri
    semu seperti "<router> (gagal dibaca)" dan ISP (IP publik) tidak termasuk."""
    if not key.startswith("device:") or ":" not in key[7:]:
        return False
    try:
        return ipaddress.ip_address(key.rsplit(":", 1)[1]).is_private
    except ValueError:
        return False


def get_isp_overview(days: int = 7) -> Dict:
    return _get_overview(days, _is_isp_key)


def get_device_overview(days: int = 7) -> Dict:
    return _get_overview(days, _is_device_key)


def _get_overview(days: int, is_member) -> Dict:
    """Ringkasan + daftar insiden entity perangkat (ISP atau perangkat LAN, sesuai
    `is_member`) untuk `days` hari terakhir, plus cakupan pemantauan supaya angka
    uptime tidak terbaca lebih pasti dari kenyataan (jam saat backend mati tidak
    terekam)."""
    init_db()
    now_dt = datetime.datetime.now()
    start_dt = now_dt - datetime.timedelta(days=days)

    conn = _connect()
    try:
        # GROUP BY sekali jalan. Versi subquery-per-baris (WHERE id = (SELECT MAX(id) ...))
        # menelusuri tabel lagi untuk SETIAP baris -> kuadratik, ±5 dtk di 50 ribu baris.
        latest = conn.execute(
            "SELECT e.entity_key, e.entity_name, e.state, e.started_at FROM noc_events e "
            "JOIN (SELECT entity_key, MAX(id) AS mid FROM noc_events "
            "WHERE kind = 'device' GROUP BY entity_key) m ON e.id = m.mid"
        ).fetchall()
    finally:
        conn.close()
    latest = [r for r in latest if is_member(r["entity_key"])]

    stats = {s["key"]: s for s in get_uptime_stats_range(start_dt, now_dt, kind="device")}
    log = [x for x in get_downtime_log_range(start_dt, now_dt, kind="device", limit=50000)
           if is_member(x["key"])]
    longest: Dict[str, int] = {}
    for x in log:
        longest[x["key"]] = max(longest.get(x["key"], 0), x["duration_seconds"])

    isps = []
    for r in latest:
        key = r["entity_key"]
        st = stats.get(key)
        isps.append({
            "key": key,
            "name": r["entity_name"],
            "location": key.split(":")[1],
            "host": key.rsplit(":", 1)[1],
            "state": r["state"],
            "state_since": r["started_at"],
            "uptime_pct": st["uptime_pct"] if st else 100.0,
            "incidents": st["incidents"] if st else 0,
            "downtime_seconds": st["downtime_seconds"] if st else 0,
            "mttr_seconds": st["mttr_seconds"] if st else None,
            "longest_seconds": longest.get(key, 0),
        })
    isps.sort(key=lambda i: (i["location"].lower(), i["name"].lower()))
    log.sort(key=lambda x: x["down_at"], reverse=True)
    incident_total = len(log)
    return {
        "days": days,
        "generated_at": now_dt.strftime(_FMT),
        "isps": isps,
        # Browser cukup menampilkan yang terbaru; ribuan baris cuma memberatkan
        # transfer & render. Total sebenarnya dikirim terpisah.
        "incident_total": incident_total,
        "incidents": log[:ISP_OVERVIEW_MAX_INCIDENTS],
        "coverage": get_coverage(start_dt, now_dt),
    }


def get_open_entity_keys() -> set:
    """entity_key yang event-nya masih berlangsung."""
    init_db()
    conn = _connect()
    try:
        rows = conn.execute("SELECT DISTINCT entity_key FROM noc_events WHERE ended_at IS NULL").fetchall()
    finally:
        conn.close()
    return {r["entity_key"] for r in rows}


def close_stale_open_events(valid_keys: Optional[set] = None, close_at: Optional[str] = None):
    """Dipanggil sekali saat startup: entity yang event-nya masih 'terbuka' dari
    sesi sebelumnya ditutup biar nggak nyangkut selamanya. `close_at` = waktu
    penutupan (default sekarang) — saat ada blackout, pemanggil mengisi ini dengan
    'waktu terakhir terlihat' supaya durasi down tidak digelembungkan oleh jam-jam
    server mati. `MAX(started_at, close_at)` menjaga ended_at tak mendahului start."""
    init_db()
    now = close_at or _now_iso()
    with _lock:
        conn = _connect()
        try:
            if valid_keys is None:
                conn.execute(
                    "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE ended_at IS NULL",
                    (now,),
                )
            else:
                rows = conn.execute("SELECT id, entity_key FROM noc_events WHERE ended_at IS NULL").fetchall()
                ids = [r["id"] for r in rows if r["entity_key"] not in valid_keys]
                if ids:
                    conn.executemany(
                        "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE id = ?",
                        [(now, i) for i in ids],
                    )
            conn.commit()
        finally:
            conn.close()


def cleanup_old_events(retention_days: int = 365) -> int:
    """Hapus event lama yang sudah selesai. Event yang masih berlangsung tidak
    dihapus, walaupun umurnya lebih dari retention_days."""
    init_db()
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=retention_days)).strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        conn = _connect()
        try:
            cur = conn.execute(
                "DELETE FROM noc_events WHERE ended_at IS NOT NULL AND ended_at < ?",
                (cutoff,),
            )
            deleted = cur.rowcount if cur.rowcount is not None else 0
            conn.commit()
        finally:
            conn.close()

        if deleted:
            conn = _connect()
            try:
                conn.execute("VACUUM")
            finally:
                conn.close()
        return deleted


def get_downtime_log(kind: Optional[str] = None, days: int = 7, limit: int = 20000) -> List[Dict]:
    """Riwayat kejadian DOWN: kapan mulai, kapan pulih (atau masih berlangsung), durasinya.
    days <= 0 = seluruh riwayat yang tersimpan. Kejadian yang mulai sebelum window
    tapi masih menyentuhnya ikut diambil."""
    init_db()
    cutoff = _cutoff_iso(days)
    now_dt = datetime.datetime.now()

    conn = _connect()
    try:
        q = (
            "SELECT kind, entity_key, entity_name, state, started_at, ended_at "
            "FROM noc_events WHERE state = 'DOWN' AND (ended_at IS NULL OR ended_at >= ?)"
        )
        params = [cutoff]
        if kind:
            q += " AND kind = ?"
            params.append(kind)
        q += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(q, params).fetchall()
        rows = sorted(_clean_incident_rows(rows), key=lambda r: r["started_at"], reverse=True)
        out = []
        for r in rows:
            started = _dt(r["started_at"])
            if r["ended_at"]:
                ended = _dt(r["ended_at"])
                duration = int((ended - started).total_seconds())
                ongoing = False
            else:
                duration = int((now_dt - started).total_seconds())
                ongoing = True
            out.append({
                "kind": r["kind"],
                "key": r["entity_key"],
                "name": r["entity_name"],
                "down_at": r["started_at"],
                "up_at": r["ended_at"],
                "duration_seconds": duration,
                "ongoing": ongoing,
            })
        return out
    finally:
        conn.close()
