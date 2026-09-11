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
- Kalau backend restart, event yang masih "berlangsung" saat itu otomatis
  ditutup di titik terakhir sebelum restart (supaya nggak nyangkut open
  selamanya) — durasinya jadi sedikit lebih pendek dari kenyataan.

Buat Log Insiden & statistik supaya jelas & akurat (bukan raw noc_events mentah),
dua hal berikut diterapkan tiap kali dibaca (lihat _clean_incident_rows):
- Kedipan sesaat (mis. sempat kejawab 1 ping pas baru boot) yang cuma bertahan
  <= FLAP_MERGE_GAP_SECONDS sebelum DOWN lagi DIGABUNG ke satu insiden, supaya
  insiden yang sebenarnya cuma satu (misalnya mati dari jam 4 sore) tidak
  terpotong-potong jadi banyak baris pendek gara-gara sempat "UP" sesaat.
- Sesudah digabung, insiden yang SUDAH SELESAI dan durasinya masih di bawah
  MIN_INCIDENT_SECONDS dibuang (dianggap noise polling, bukan insiden beneran).
  Insiden yang masih berlangsung tidak pernah dibuang oleh aturan ini.
"""

import os
import sqlite3
import datetime
import threading
from typing import Dict, List, Optional

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


def _now_iso() -> str:
    return datetime.datetime.now().strftime(_FMT)


# Jarak tanpa polling yang dianggap "pemantauan mati" (bukan sekadar restart cepat).
MONITOR_GAP_THRESHOLD_SECONDS = 300


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
    ref_dt = datetime.datetime.strptime(reference, _FMT) if reference else now_dt
    with _lock:
        conn = _connect()
        try:
            last = _last_activity_iso(conn)
            if not last:
                return None
            last_dt = datetime.datetime.strptime(last, _FMT)
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


def reconcile_after_gap(entities: List[Dict], gap_start: str):
    """Dipanggil sekali sesudah blackout, dengan status terkini tiap entity.

    - state SAMA dgn sebelum mati → event lama DITERUSKAN (perangkat yang masih
      DOWN dihitung mati sejak semalam; yang masih UP dianggap UP selama blackout).
    - state BEDA → event lama ditutup di `gap_start` (kita tak tahu persisnya),
      event baru dibuka sekarang.
    - entity yang hilang → event lama ditutup di `gap_start`.
    """
    init_db()
    now = _now_iso()
    cur_by_key = {e["key"]: e for e in entities}
    with _lock:
        conn = _connect()
        try:
            open_rows = conn.execute(
                "SELECT id, entity_key, entity_name, state FROM noc_events WHERE ended_at IS NULL"
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
                    continue
                conn.execute(
                    "UPDATE noc_events SET ended_at = MAX(started_at, ?) WHERE id = ?",
                    (gap_start, r["id"]),
                )
                conn.execute(
                    "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) VALUES (?, ?, ?, ?, ?)",
                    (cur["kind"], cur["key"], cur["name"], cur["state"], now),
                )
            for e in entities:
                if e["key"] not in seen:
                    conn.execute(
                        "INSERT INTO noc_events (kind, entity_key, entity_name, state, started_at) VALUES (?, ?, ?, ?, ?)",
                        (e["kind"], e["key"], e["name"], e["state"], now),
                    )
            conn.commit()
        finally:
            conn.close()


def get_blackouts(days: int = 7) -> List[Dict]:
    init_db()
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime(_FMT)
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


# Kejadian DOWN yang sudah selesai & durasinya di bawah ini dianggap kedipan/noise
# sesaat (mis. satu siklus polling yang meleset) — tidak dihitung sebagai insiden.
# Yang masih berlangsung tidak pernah dibuang oleh ambang ini, berapa pun umurnya
# sejauh ini, karena kita belum tahu itu bakal jadi insiden panjang atau bukan.
MIN_INCIDENT_SECONDS = 60

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
            gap = (datetime.datetime.strptime(e["started_at"], _FMT)
                   - datetime.datetime.strptime(cur["ended_at"], _FMT)).total_seconds()
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
        started = datetime.datetime.strptime(r["started_at"], _FMT)
        ended = datetime.datetime.strptime(r["ended_at"], _FMT)
        if (ended - started).total_seconds() >= min_seconds:
            out.append(r)
    return out


def _clean_incident_rows(rows: List[sqlite3.Row]) -> List[Dict]:
    """Pipeline standar buat log/statistik: gabung kedipan lalu buang yang masih
    terlalu pendek. Dipakai di semua fungsi baca supaya Log Insiden & statistik
    konsisten — sesaat/noise tidak ikut dihitung, insiden nyata tidak terpotong."""
    return _drop_short_incidents(_merge_flaps(rows))


def get_uptime_stats(kind: Optional[str] = None, days: int = 7) -> List[Dict]:
    """Ringkasan keandalan per entity dari noc_events: uptime %, jumlah insiden
    DOWN, total downtime, dan MTTR. Window = `days` hari terakhir."""
    now_dt = datetime.datetime.now()
    return get_uptime_stats_range(now_dt - datetime.timedelta(days=days), now_dt, kind=kind)


def get_uptime_stats_range(start_dt: datetime.datetime, end_dt: datetime.datetime,
                           kind: Optional[str] = None) -> List[Dict]:
    """Sama seperti get_uptime_stats tapi window-nya eksplisit [start_dt, end_dt).
    Insiden yang melewati batas window dipotong di batas itu. `end_dt` di masa
    depan otomatis di-clamp ke sekarang untuk insiden yang masih berlangsung."""
    init_db()
    now_dt = datetime.datetime.now()
    win_start = start_dt
    win_end = min(end_dt, now_dt)
    window_seconds = max(0.0, (win_end - win_start).total_seconds())
    # Catatan: window TIDAK dikurangi durasi blackout. Alasannya, status sebelum &
    # sesudah blackout tetap dipakai: perangkat yang DOWN sebelum mati DAN masih
    # DOWN saat pemantauan hidup lagi → event-nya diteruskan (reconcile_after_gap),
    # jadi blackout ikut dihitung down. Yang UP di kedua sisi dianggap UP selama
    # blackout. Yang hilang hanyalah kejadian singkat yang murni di dalam blackout.
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
    rows = _clean_incident_rows(rows)

    agg: Dict[str, Dict] = {}
    for r in rows:
        started = datetime.datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
        ended = (datetime.datetime.strptime(r["ended_at"], "%Y-%m-%d %H:%M:%S")
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
                           kind: Optional[str] = None, limit: int = 2000) -> List[Dict]:
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
    rows = _clean_incident_rows(rows)

    out = []
    for r in rows:
        started = datetime.datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
        if r["ended_at"]:
            ended = datetime.datetime.strptime(r["ended_at"], "%Y-%m-%d %H:%M:%S")
            ongoing = False
        else:
            ended = now_dt
            ongoing = True
        out.append({
            "kind": r["kind"],
            "key": r["entity_key"],
            "name": r["entity_name"],
            "down_at": r["started_at"],
            "up_at": r["ended_at"],
            "duration_seconds": int((ended - started).total_seconds()),
            "ongoing": ongoing,
        })
    return out


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


def cleanup_old_events(retention_days: int = 30) -> int:
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


def get_downtime_log(kind: Optional[str] = None, days: int = 7, limit: int = 300) -> List[Dict]:
    """Riwayat kejadian DOWN: kapan mulai, kapan pulih (atau masih berlangsung), durasinya."""
    init_db()
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    now_dt = datetime.datetime.now()

    conn = _connect()
    try:
        q = (
            "SELECT kind, entity_key, entity_name, state, started_at, ended_at "
            "FROM noc_events WHERE state = 'DOWN' AND started_at >= ?"
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
            started = datetime.datetime.strptime(r["started_at"], "%Y-%m-%d %H:%M:%S")
            if r["ended_at"]:
                ended = datetime.datetime.strptime(r["ended_at"], "%Y-%m-%d %H:%M:%S")
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
