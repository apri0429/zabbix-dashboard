import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "../api";
import { Globe01, Clock } from "@untitledui/icons";
import { BandTitle, MItem, MFacts } from "../components/ns";

/* ─── Design tokens (gaya NetSuite) ─── */
const T = {
  font:      "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",
  text:      "#333333",
  label:     "#666666",
  muted:     "#8a8a8a",
  link:      "#255599",
  band:      "#dfe4eb",   // pita judul seksi
  bandText:  "#4d5f79",
  colHead:   "#e5e5e5",   // kepala kolom tabel
  zebra:     "#f5f7fa",
  hover:     "#e5eefa",
  field:     "#cccccc",
  surface:   "#ffffff",
  page:      "#f6f7f9",
  ok:        "#2e7d32",
  okBg:      "#d7fccf",
  bad:       "#c62828",
  badBg:     "#fccfcf",
  warn:      "#8a6100",
  warnBg:    "#fcf3cf",
  infoBg:    "#d5e3f8",
  primary:   "#2a5db0",
};

// days 0 = minggu lalu penuh (Senin-Minggu): periode yang sama persis dengan PDF &
// rekap WA mingguan, supaya angkanya bisa dicocokkan.
const RANGES = [
  { days: 1,  label: "24 jam terakhir" },
  { days: 7,  label: "7 hari terakhir" },
  { days: 0,  label: "Minggu lalu (sama dengan laporan)", short: "Minggu lalu" },
  { days: 30, label: "30 hari terakhir" },
  { days: 90, label: "3 bulan terakhir" },
];

const CATS = [
  { id: "all",    label: "Semua" },
  { id: "isp",    label: "Internet" },
  { id: "device", label: "Perangkat" },
];

const VIEWS = [
  { id: "ringkasan", label: "Daftar Koneksi", Icon: Globe01 },
  { id: "riwayat",   label: "Riwayat Putus", Icon: Clock },
];

const STATE = {
  UP:       { fg: T.ok,    label: "Normal" },
  DOWN:     { fg: T.bad,   label: "Mati" },
  UNKNOWN:  { fg: T.warn,  label: "Belum diketahui" },
  INACTIVE: { fg: T.muted, label: "Tidak dipantau" },
};

const HARI  = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* ─── Helpers ─── */
const pad = (n) => String(n).padStart(2, "0");
const parseTs = (s) => (s ? new Date(s.replace(" ", "T")) : null);
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateText = (d) => `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

function fmtDur(sec) {
  if (sec == null) return "–";
  if (sec < 60) return `${sec} detik`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} jam ${m % 60} menit` : `${h} jam`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} hari ${h % 24} jam` : `${d} hari`;
}

// Jam hidup; tambahkan tanggal kalau pulihnya beda hari dengan jam mati.
function upText(x) {
  if (x.ongoing) return null;
  const a = parseTs(x.down_at);
  const b = parseTs(x.up_at);
  return dayKey(a) === dayKey(b) ? clock(b) : `${b.getDate()} ${BULAN[b.getMonth()]}, ${clock(b)}`;
}

const sinceNow = (d) => fmtDur(Math.max(0, Math.round((Date.now() - d.getTime()) / 1000)));
const uptimeColor = (p) => (p == null ? T.muted : p >= 99.9 ? T.ok : p >= 99 ? T.warn : T.bad);
const quality = (p) => (p == null ? "Belum ada data" : p >= 99.9 ? "Sangat stabil" : p >= 99 ? "Stabil" : p >= 95 ? "Kurang stabil" : "Sering terputus");
// Uptime hanya menghitung waktu DOWN yang terbukti. Kalau statusnya sekarang tidak
// terpantau (router site tidak bisa dibaca), angka 100% itu bukan bukti stabil.
const unmonitored = (e) => e.state === "UNKNOWN" || e.state === "INACTIVE";
const stabilityText = (e) => (unmonitored(e) ? "Tidak terpantau" : quality(e.uptime_pct));
const stabilityColor = (e) => (unmonitored(e) ? T.muted : uptimeColor(e.uptime_pct));
const troubleText = (e) => (e.incidents ? `${e.incidents} kali putus, total ${fmtDur(e.downtime_seconds)}` : "Tidak pernah putus")
  + (e.unmonitored_seconds ? ` · tidak terpantau ${fmtDur(e.unmonitored_seconds)}` : "");

function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function useIsMobile() {
  const get = () => (typeof window === "undefined" ? false : window.innerWidth < 720);
  const [m, setM] = useState(get);
  useEffect(() => {
    const h = () => setM(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

/* ─── Komponen kecil gaya NetSuite ─── */
const btn = (primary) => ({
  padding: "5px 14px", borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: T.font, whiteSpace: "nowrap",
  border: `1px solid ${primary ? T.primary : "#b2b2b2"}`,
  background: primary ? T.primary : "#e9e9e9",
  color: primary ? "#fff" : T.text,
});

const fieldStyle = {
  height: 30, padding: "0 8px", borderRadius: 3, border: `1px solid ${T.field}`,
  fontSize: 13, color: T.text, background: T.surface, outline: "none", fontFamily: T.font, width: "100%",
};

const Field = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: T.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
    {children}
  </label>
);

const Band = ({ children, right }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
    padding: "7px 12px", background: T.band, color: T.bandText, fontSize: 14, fontWeight: 700,
  }}>
    <BandTitle>{children}</BandTitle>
    {right && <span style={{ fontSize: 12, fontWeight: 600 }}>{right}</span>}
  </div>
);

const Alert = ({ tone, title, children }) => {
  const c = { ok: [T.okBg, T.ok, "✓"], bad: [T.badBg, T.bad, "!"], warn: [T.warnBg, T.warn, "!"], info: [T.infoBg, T.primary, "i"] }[tone];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 14px", background: c[0], borderRadius: 3, fontSize: 13, color: T.text, lineHeight: 1.55 }}>
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: c[1], color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
      }}>{c[2]}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {title && <div style={{ fontWeight: 700, fontSize: 14, color: c[1] }}>{title}</div>}
        {children}
      </div>
    </div>
  );
};

const th = { padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: T.label, textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", background: T.colHead };
const td = { padding: "8px 12px", fontSize: 13, color: T.text, verticalAlign: "top" };

/* ─── Page ─── */
export default function NetworkLog() {
  const isMobile = useIsMobile();
  const [days, setDays] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("hari");
    const d = raw == null || raw === "" ? NaN : Number(raw);
    return RANGES.some((r) => r.days === d) ? d : 7;
  });
  // Pilihan awal bisa lewat URL (?kategori=isp&tampilan=riwayat) supaya tautan bisa dibagikan.
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [cat, setCat] = useState(() => (CATS.some((c) => c.id === params.get("kategori")) ? params.get("kategori") : "all"));
  const [view, setView] = useState(() => (VIEWS.some((v) => v.id === params.get("tampilan")) ? params.get("tampilan") : "ringkasan"));
  const [loc, setLoc] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("worst");
  const [entityKey, setEntityKey] = useState("all");
  const [showHelp, setShowHelp] = useState(false);
  const [hoverRow, setHoverRow] = useState(null);
  const [perPage, setPerPage] = useState("10");
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: res } = await axios.get(`${API_BASE}/api/noc/network`, { params: { days }, timeout: 30000 });
      // Backend lama (belum di-restart) menjawab endpoint baru dengan index.html, bukan JSON.
      if (!res || typeof res !== "object" || !Array.isArray(res.entities)) {
        throw new Error("Respons tidak valid. Pastikan backend sudah di-restart dengan versi terbaru.");
      }
      setData(res);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const entities = data?.entities || [];
  const locations = useMemo(() => [...new Set(entities.map((e) => e.location))].sort(), [entities]);

  // Cakupan untuk ringkasan & daftar: kategori + lokasi (pencarian hanya menyaring daftar).
  const scoped = useMemo(
    () => entities.filter((e) => (cat === "all" || e.category === cat) && (loc === "all" || e.location === loc)),
    [entities, cat, loc],
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rank = { DOWN: 0, UNKNOWN: 1, UP: 2, INACTIVE: 3 };
    const list = scoped.filter((e) => !term || `${e.name} ${e.host} ${e.location}`.toLowerCase().includes(term));
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "location") return a.location.localeCompare(b.location) || a.name.localeCompare(b.name);
      return (rank[a.state] ?? 3) - (rank[b.state] ?? 3) ||
        (a.uptime_pct ?? 100) - (b.uptime_pct ?? 100) || b.incidents - a.incidents;
    });
  }, [scoped, q, sort]);

  const kpi = useMemo(() => {
    const live = scoped.filter((e) => e.state !== "INACTIVE");
    return {
      total: live.length,
      downNow: live.filter((e) => e.state === "DOWN").sort((a, b) => a.state_since.localeCompare(b.state_since)),
      online: live.filter((e) => e.state === "UP").length,
      incidents: scoped.reduce((s, e) => s + e.incidents, 0),
      downSeconds: scoped.reduce((s, e) => s + e.downtime_seconds, 0),
    };
  }, [scoped]);

  const incidents = useMemo(() => {
    const keys = new Set(shown.map((e) => e.key));
    // Kejadian "tidak terpantau" ikut di riwayat, berurutan dengan kejadian mati.
    return [...(data?.incidents || []), ...(data?.unmonitored || [])]
      .filter((x) => keys.has(x.key) && (entityKey === "all" || x.key === entityKey))
      .sort((a, b) => b.down_at.localeCompare(a.down_at));
  }, [data, shown, entityKey]);

  const lastIncident = useMemo(() => {
    const m = {};
    for (const x of data?.incidents || []) if (!m[x.key] || x.down_at > m[x.key].down_at) m[x.key] = x;
    return m;
  }, [data]);

  const focus = entityKey !== "all" ? entities.find((e) => e.key === entityKey) : null;
  const truncated = data && (data.incident_totals.isp + data.incident_totals.device) > data.incidents.length;
  const cov = data?.coverage;
  const lowCoverage = cov && cov.coverage_pct != null && cov.coverage_pct < 99;
  const minMin = data ? Math.round(data.min_incident_seconds / 60) : 15;
  const rangeObj = RANGES.find((r) => r.days === days);
  const rangeLabel = rangeObj?.short || rangeObj?.label;
  const hasUncertain = incidents.some((x) => !x.ongoing && !x.duration_certain);
  const gaps = data?.monitoring_gaps || [];
  const gapSeconds = gaps.reduce((s, g) => s + g.seconds, 0);
  const isUnmon = (x) => x.type === "unmonitored";
  const kindText = (x) => (isUnmon(x)
    ? <span style={{ color: T.muted, fontWeight: 700 }}>Tidak terpantau<div style={{ fontWeight: 400, fontSize: 11.5 }}>{x.reason}</div></span>
    : <span style={{ color: T.bad, fontWeight: 700 }}>Mati</span>);
  const endText = (x) => (x.ongoing ? (isUnmon(x) ? "Masih tidak terpantau" : "Masih mati") : upText(x));

  // Halaman: daftar yang dipakai tabel dipotong sesuai jumlah baris per halaman.
  useEffect(() => { setPage(1); }, [cat, loc, q, sort, days, view, entityKey, perPage]);
  const listLen = view === "ringkasan" ? shown.length : incidents.length;
  const size = perPage === "all" ? Math.max(listLen, 1) : Number(perPage);
  const totalPages = Math.max(1, Math.ceil(listLen / size));
  const curPage = Math.min(page, totalPages);
  const from = (curPage - 1) * size;
  const pageShown = shown.slice(from, from + size);
  const pageIncidents = incidents.slice(from, from + size);
  const startRow = listLen === 0 ? 0 : from + 1;
  const endRow = Math.min(from + size, listLen);

  const openHistory = (key) => { setEntityKey(key); setView("riwayat"); };
  const exportCsv = () => {
    const rows = [["Jenis", "Nama", "Lokasi", "Alamat", "Kejadian", "Mulai", "Selesai", "Durasi (detik)", "Durasi", "Keterangan"]];
    for (const x of incidents) {
      const un = x.type === "unmonitored";
      rows.push([
        x.category === "isp" ? "Internet" : "Perangkat", x.name, x.key.split(":")[1], x.key.split(":").pop(),
        un ? "Tidak terpantau" : "Mati",
        x.down_at, x.ongoing ? "" : x.up_at, x.duration_seconds, fmtDur(x.duration_seconds),
        un ? `${x.reason}${x.ongoing ? " (masih)" : ""}`
          : x.ongoing ? "Masih mati" : (x.duration_certain ? "" : `Sebagian ${fmtDur(x.unmonitored_seconds)} tidak tercatat`),
      ]);
    }
    downloadCsv(`catatan-jaringan-${days ? `${days}hari` : "minggu-lalu"}.csv`, rows);
  };

  const panel = { background: T.surface, borderRadius: 3, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" };
  const rowStyle = (i, key, clickable) => ({
    background: hoverRow === key ? T.hover : i % 2 ? T.zebra : T.surface,
    cursor: clickable ? "pointer" : "default",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, color: T.text, fontFamily: T.font }}>
      {/* ── Judul halaman + tombol ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, letterSpacing: "-0.01em", color: T.text }}>Network Log</div>
          <div style={{ fontSize: 12, color: T.label, marginTop: 2 }}>
            {data ? `Updated at ${data.generated_at.slice(11, 16)} · auto-refresh every minute` : "Loading…"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowHelp((v) => !v)} style={btn(false)}>{showHelp ? "Hide Guide" : "Guide"}</button>
          <button onClick={exportCsv} disabled={!incidents.length}
            style={{ ...btn(true), opacity: incidents.length ? 1 : 0.5, cursor: incidents.length ? "pointer" : "not-allowed" }}>
            Download History
          </button>
        </div>
      </div>

      {error && (
        <Alert tone="bad" title="Data belum bisa dimuat">
          <div>Coba lagi sebentar lagi.</div>
          <div style={{ fontSize: 11.5, color: T.label, marginTop: 2 }}>{error}</div>
          <button onClick={() => { setLoading(true); load(); }} style={{ ...btn(false), marginTop: 8 }}>Coba lagi</button>
        </Alert>
      )}

      {loading && !data && <div style={{ ...panel, padding: 20, color: T.label, fontSize: 13 }}>Memuat data…</div>}

      {data && (
        <>
          {/* ── Kondisi saat ini ── */}
          {kpi.total > 0 && (
            kpi.downNow.length === 0 ? (
              <Alert tone="ok" title="Semua koneksi berjalan normal">
                {kpi.online} koneksi dipantau. {rangeLabel}:{" "}
                {kpi.incidents ? `${kpi.incidents} kali putus, total ${fmtDur(kpi.downSeconds)}.` : "tidak ada yang putus."}
              </Alert>
            ) : (
              <Alert tone="bad" title={`${kpi.downNow.length} koneksi sedang mati`}>
                {kpi.downNow.map((e) => {
                  const since = parseTs(e.state_since);
                  return (
                    <div key={e.key}>
                      <a onClick={() => openHistory(e.key)} style={{ color: T.link, cursor: "pointer", fontWeight: 600 }}>{e.name}</a>
                      {" "}({e.location}): mati sejak pukul {clock(since)}, sudah {sinceNow(since)}.
                    </div>
                  );
                })}
                <div style={{ marginTop: 4, color: T.label }}>
                  {rangeLabel}: {kpi.incidents} kali putus, total {fmtDur(kpi.downSeconds)}.
                </div>
              </Alert>
            )
          )}

          {gaps.length > 0 && (
            <Alert tone="warn" title={`Pemantauan sempat terhenti ${gaps.length} kali (total ${fmtDur(gapSeconds)})`}>
              Pada waktu itu tidak ada satu pun perangkat yang terbaca, jadi status semua perangkat tidak diketahui:{" "}
              {gaps.slice(0, 5).map((g, i) => {
                const a = parseTs(g.from);
                return <span key={g.from}>{i ? ", " : ""}{a.getDate()} {BULAN[a.getMonth()]} {clock(a)} ({fmtDur(g.seconds)})</span>;
              })}{gaps.length > 5 ? ", …" : "."}
            </Alert>
          )}

          {lowCoverage && (
            <Alert tone="warn" title="Catatan belum lengkap">
              Sistem pencatat sempat mati selama {fmtDur(cov.blackout_seconds)} pada periode ini, jadi gangguan di
              waktu itu tidak tercatat. Kondisi sebenarnya bisa sedikit lebih buruk dari yang terlihat.
            </Alert>
          )}

          {showHelp && (
            <Alert tone="info" title="Cara membaca halaman ini">
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                <li><b>Internet</b> = sambungan internet dari penyedia di tiap lokasi. <b>Perangkat</b> = alat jaringan di kantor, seperti WiFi dan switch.</li>
                <li><b>Normal</b> berarti sedang tersambung. <b>Mati</b> berarti sedang tidak bisa dihubungi.</li>
                <li><b>Kestabilan</b>: <i>Sangat stabil</i> hampir tidak pernah putus, <i>Stabil</i> sesekali putus sebentar, <i>Kurang stabil</i> dan <i>Sering terputus</i> perlu ditindaklanjuti. <i>Tidak terpantau</i> berarti statusnya sekarang tidak bisa dibaca, jadi kestabilannya belum bisa dinilai.</li>
                <li>Putus yang lebih singkat dari <b>{minMin} menit</b> tidak dicatat, supaya daftar tidak ramai.</li>
                <li>Klik nama untuk melihat kapan saja ia pernah mati dan hidup lagi.</li>
              </ul>
            </Alert>
          )}

          {/* ── Filter ── */}
          <div style={panel}>
            <Band>Filter</Band>
            <div style={{
              display: "grid", gap: 12, padding: 12,
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))",
            }}>
              <Field label="Jenis">
                <select value={cat} onChange={(e) => { setCat(e.target.value); setEntityKey("all"); }} style={fieldStyle}>
                  {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Periode">
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={fieldStyle}>
                  {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Lokasi">
                <select value={loc} onChange={(e) => { setLoc(e.target.value); setEntityKey("all"); }} style={fieldStyle}>
                  <option value="all">Semua lokasi</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Urutkan">
                <select value={sort} onChange={(e) => setSort(e.target.value)} style={fieldStyle}>
                  <option value="worst">Yang bermasalah dulu</option>
                  <option value="name">Nama</option>
                  <option value="location">Lokasi</option>
                </select>
              </Field>
              <Field label="Cari">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama atau lokasi" style={fieldStyle} />
              </Field>
            </div>
          </div>

          {/* ── Subtab + daftar ── */}
          <div style={panel}>
            <div style={{ display: "flex", gap: 2, background: T.band, padding: "6px 6px 0" }}>
              {VIEWS.map((v) => {
                const on = view === v.id;
                return (
                  <button key={v.id} onClick={() => setView(v.id)} style={{
                    padding: "7px 16px", border: "none", borderRadius: "3px 3px 0 0", cursor: "pointer",
                    fontFamily: T.font, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 7,
                    background: on ? T.surface : "transparent", color: on ? T.text : T.bandText,
                  }}><v.Icon width={15} height={15} />{v.label}</button>
                );
              })}
            </div>

            {view === "ringkasan" ? (
              shown.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: T.label, fontSize: 13 }}>
                  {entities.length === 0 ? "Belum ada data." : "Tidak ada yang cocok dengan filter."}
                </div>
              ) : isMobile ? (
                pageShown.map((e, i) => {
                  const st = STATE[e.state] || STATE.UNKNOWN;
                  const last = lastIncident[e.key];
                  const lastAt = last && parseTs(last.down_at);
                  const since = e.state === "DOWN" && e.state_since ? parseTs(e.state_since) : null;
                  return (
                    <MItem key={e.key} i={i} onClick={() => openHistory(e.key)}
                      title={<span style={{ color: T.link }}>{e.name}</span>}
                      sub={`${e.category === "isp" ? "Internet" : "Perangkat"} · ${e.location}`}
                      right={<b style={{ color: st.fg }}>{st.label}</b>}>
                      {since && <div style={{ fontSize: 12, color: T.bad, marginBottom: 6 }}>sejak {clock(since)}, sudah {sinceNow(since)}</div>}
                      <MFacts cols={2} items={[
                        ["Kestabilan", <><span style={{ color: stabilityColor(e) }}>{stabilityText(e)}</span><div style={{ fontWeight: 400, fontSize: 11.5, color: T.label }}>{troubleText(e)}</div></>],
                        ["Terakhir putus", last ? <>{lastAt.getDate()} {BULAN[lastAt.getMonth()]} · {clock(lastAt)}<div style={{ fontWeight: 400, fontSize: 11.5, color: last.ongoing ? T.bad : T.label }}>{last.ongoing ? "belum hidup" : `Hidup ${upText(last)}`}</div></> : "–"],
                      ]} />
                    </MItem>
                  );
                })
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                      <tr>
                        {["Nama", "Jenis", "Lokasi", "Status", "Kestabilan", "Terakhir putus"].map((h) => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {pageShown.map((e, i) => {
                        const st = STATE[e.state] || STATE.UNKNOWN;
                        const last = lastIncident[e.key];
                        const lastAt = last && parseTs(last.down_at);
                        const since = e.state === "DOWN" && e.state_since ? parseTs(e.state_since) : null;
                        return (
                          <tr key={e.key} onClick={() => openHistory(e.key)} title="Klik untuk melihat riwayat"
                            onMouseEnter={() => setHoverRow(e.key)} onMouseLeave={() => setHoverRow(null)}
                            style={rowStyle(i, e.key, true)}>
                            <td style={td}><span style={{ color: T.link, fontWeight: 600 }}>{e.name}</span></td>
                            <td style={{ ...td, color: T.label }}>{e.category === "isp" ? "Internet" : "Perangkat"}</td>
                            <td style={td}>{e.location}</td>
                            <td style={{ ...td, color: st.fg, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {st.label}
                              {since && <div style={{ fontWeight: 400, fontSize: 12 }}>sejak {clock(since)}, sudah {sinceNow(since)}</div>}
                            </td>
                            <td style={td}>
                              <div style={{ color: stabilityColor(e), fontWeight: 700 }}>{stabilityText(e)}</div>
                              <div style={{ fontSize: 12, color: T.label }}>{troubleText(e)}</div>
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              {last ? (
                                <>
                                  <div>{lastAt.getDate()} {BULAN[lastAt.getMonth()]} {lastAt.getFullYear()}</div>
                                  <div style={{ fontSize: 12, color: T.label }}>
                                    Mati {clock(lastAt)} · {last.ongoing ? <span style={{ color: T.bad }}>belum hidup</span> : `Hidup ${upText(last)}`}
                                  </div>
                                </>
                              ) : <span style={{ color: T.muted }}>–</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <>
                {focus && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", fontSize: 13 }}>
                    <span>Riwayat untuk: <b>{focus.name}</b> <span style={{ color: T.label }}>({focus.location})</span></span>
                    <button onClick={() => setEntityKey("all")} style={btn(false)}>Tampilkan semua</button>
                  </div>
                )}
                {incidents.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: T.ok, fontSize: 13, fontWeight: 600 }}>
                    Tidak ada yang putus atau tidak terpantau pada periode ini.
                  </div>
                ) : isMobile ? (
                  pageIncidents.map((x, i) => {
                    const a = parseTs(x.down_at);
                    return (
                      <MItem key={`${x.type || "down"}-${x.key}-${x.down_at}`} i={i} title={x.name}
                        sub={`${x.category === "isp" ? "Internet" : "Perangkat"} · ${x.key.split(":")[1]} · ${dateText(a)}`}
                        right={<b>{fmtDur(x.duration_seconds)}{!x.ongoing && !x.duration_certain && <span style={{ color: T.warn }}> *</span>}</b>}>
                        <MFacts cols={2} items={[
                          ["Kejadian", kindText(x)],
                          ["Mulai", clock(a)],
                          ["Selesai", x.ongoing ? <span style={{ color: isUnmon(x) ? T.muted : T.bad }}>{endText(x)}</span> : upText(x)],
                        ]} />
                      </MItem>
                    );
                  })
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                      <thead>
                        <tr>
                          {["Tanggal", "Nama", "Lokasi", "Kejadian", "Mulai", "Selesai", "Lama"].map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {pageIncidents.map((x, i) => {
                          const a = parseTs(x.down_at);
                          const rk = `${x.type || "down"}-${x.key}-${x.down_at}`;
                          return (
                            <tr key={rk} onMouseEnter={() => setHoverRow(rk)} onMouseLeave={() => setHoverRow(null)}
                              style={rowStyle(i, rk, false)}>
                              <td style={{ ...td, whiteSpace: "nowrap" }}>{dateText(a)}</td>
                              <td style={td}>
                                <span style={{ fontWeight: 600 }}>{x.name}</span>
                                <div style={{ fontSize: 12, color: T.label }}>{x.category === "isp" ? "Internet" : "Perangkat"}</div>
                              </td>
                              <td style={td}>{x.key.split(":")[1]}</td>
                              <td style={td}>{kindText(x)}</td>
                              <td style={{ ...td, whiteSpace: "nowrap" }}>{clock(a)}</td>
                              <td style={{ ...td, whiteSpace: "nowrap", color: x.ongoing ? (isUnmon(x) ? T.muted : T.bad) : T.text, fontWeight: x.ongoing ? 700 : 400 }}>
                                {endText(x)}
                              </td>
                              <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>
                                {fmtDur(x.duration_seconds)}{!x.ongoing && !x.duration_certain && <span style={{ color: T.warn }}> *</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {(hasUncertain || truncated) && (
                  <div style={{ padding: "8px 12px", fontSize: 12, color: T.label, lineHeight: 1.6 }}>
                    {hasUncertain && <div><span style={{ color: T.warn }}>*</span> Sebagian waktunya tidak tercatat, lamanya bisa sedikit berbeda.</div>}
                    {truncated && <div>Hanya kejadian terbaru yang ditampilkan. Pilih periode yang lebih pendek untuk melihat semuanya.</div>}
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.zebra, gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.label }}>
                Menampilkan <b style={{ color: T.text }}>{startRow}–{endRow}</b> dari <b style={{ color: T.text }}>{listLen}</b> {view === "ringkasan" ? "koneksi" : "kejadian"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <select value={perPage} onChange={(e) => setPerPage(e.target.value)} style={{ ...fieldStyle, width: "auto" }} aria-label="Baris per halaman">
                  {["10", "25", "50", "all"].map((n) => <option key={n} value={n}>{n === "all" ? "Semua" : `${n} baris`}</option>)}
                </select>
                {perPage !== "all" && (
                  <>
                    <button onClick={() => setPage(Math.max(1, curPage - 1))} disabled={curPage === 1} style={btn(false, curPage === 1)}>‹ Sebelumnya</button>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>{curPage} / {totalPages}</span>
                    <button onClick={() => setPage(Math.min(totalPages, curPage + 1))} disabled={curPage === totalPages} style={btn(false, curPage === totalPages)}>Berikutnya ›</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
