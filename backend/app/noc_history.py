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
            conn.commit()
        finally:
            conn.close()
        _initialized = True


def _now_iso() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


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


def close_stale_open_events(valid_keys: Optional[set] = None):
    """Dipanggil sekali saat startup: entity yang event-nya masih 'terbuka' dari
    sesi sebelumnya (mis. backend baru restart) ditutup di waktu sekarang biar
    nggak nyangkut selamanya. `valid_keys` opsional buat cuma nutup yang masih
    dikenal (lainnya dibiarkan, nanti reconcile alami pas polling jalan lagi)."""
    init_db()
    now = _now_iso()
    with _lock:
        conn = _connect()
        try:
            if valid_keys is None:
                conn.execute("UPDATE noc_events SET ended_at = ? WHERE ended_at IS NULL", (now,))
            else:
                rows = conn.execute("SELECT id, entity_key FROM noc_events WHERE ended_at IS NULL").fetchall()
                ids = [r["id"] for r in rows if r["entity_key"] not in valid_keys]
                if ids:
                    conn.executemany("UPDATE noc_events SET ended_at = ? WHERE id = ?", [(now, i) for i in ids])
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
