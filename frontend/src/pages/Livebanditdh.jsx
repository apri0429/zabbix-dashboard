import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../api";
import "../components/templateComponents/templateComponents.css";

const T = {
  navy:      "#1a2a57",
  navyMid:   "#2d4a8c",
  teal:      "#2a9d8f",
  text:      "#0f2035",
  textSoft:  "#425575",
  muted:     "#5a6b88",
  border:    "rgba(26,42,87,0.10)",
  borderMid: "rgba(26,42,87,0.18)",
  surface:   "#ffffff",
  surfaceAlt:"rgba(248,249,250,0.95)",
};

const Dot = ({ color, size = 6 }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

// Download vs Upload sengaja dibikin dua warna yang beda jauh (teal vs oranye),
// bukan dua nuansa navy yang mirip — biar kebedain sekilas tanpa baca label.
const DL_COLOR = "#2a9d8f"; // teal — Download
const UL_COLOR = "#e76f51"; // oranye/koral — Upload

// Warna khas per router (sama pendekatan kayak siteColor di NOC & User Active) —
// tiap router dijatah warna berikutnya dari palet secara berurutan, biar gak ada
// dua router yang kebagian warna sama.
const SITE_PALETTE = ["#2563eb", "#7c3aed", "#0d9488", "#c2410c", "#be185d", "#4f46e5"];
const _siteColorAssigned = new Map();
function siteColor(name) {
  const key = String(name || "");
  let color = _siteColorAssigned.get(key);
  if (!color) {
    color = SITE_PALETTE[_siteColorAssigned.size % SITE_PALETTE.length];
    _siteColorAssigned.set(key, color);
  }
  return color;
}

// Grafik tren kecil buat tiap baris (mirip sparkline latency di NOC) — biar
// kelihatan naik-turunnya trafik, bukan cuma angka & bar % dari max limit.
const TREND_MAX_POINTS = 30; // ~2.5 menit riwayat (polling tiap 5 detik)

const Sparkline = ({ points = [], color, w = 100, h = 26 }) => {
  const vals = points.map((p) => (p == null ? null : Number(p))).filter((v) => v != null && !Number.isNaN(v));
  if (vals.length < 2) return <span style={{ fontSize: 10.5, color: T.muted }}>Mengumpulkan data…</span>;
  const max = Math.max(...vals, 0.001);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const stepX = w / (points.length - 1);
  let d = "";
  points.forEach((p, i) => {
    if (p == null || Number.isNaN(Number(p))) return;
    const x = i * stepX;
    const y = h - ((Number(p) - min) / span) * (h - 4) - 2;
    d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
};

export default function LiveBandwidth() {
  const [data, setData]               = useState([]);
  const [trendMap, setTrendMap]       = useState({}); // key -> [rate Mbps, ...] riwayat singkat
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [routerId, setRouterId]       = useState("all");
  const [lastUpdate, setLastUpdate]   = useState("");
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth <= 640);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const routerOptions = [
    { value: "all", label: "Semua Router" },
    { value: "1",   label: "HO Duta Garden" },
    { value: "2",   label: "Gudang Jatake" },
    { value: "3",   label: "Gudang Ks Tubun" },
    { value: "4",   label: "Gudang Rawa Bokor" },
  ];

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 200);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fetchEtherTraffic = async (isBackground = false) => {
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      const url =
        routerId === "all"
          ? buildApiUrl("/api/mikrotik/ether-traffic")
          : buildApiUrl(`/api/mikrotik/ether-traffic?router_id=${routerId}`);

      const res = await fetch(url);
      let rawText = "";
      try { rawText = await res.text(); } catch {}
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.message || parsed?.error || rawText || "Gagal mengambil data");
      }

      const rows = Array.isArray(parsed?.data) ? parsed.data : [];
      setData(rows);
      setLastUpdate(new Date().toLocaleString("id-ID"));

      // Simpan rate terbaru tiap interface ke riwayat singkat (buat sparkline).
      setTrendMap((prev) => {
        const next = { ...prev };
        for (const item of rows) {
          const key = `${item.router_id}|${item.name}`;
          const rateMbps = item.rate == null ? null : Number(item.rate) / 1_000_000;
          const hist = [...(next[key] || []), rateMbps];
          next[key] = hist.slice(-TREND_MAX_POINTS);
        }
        return next;
      });
    } catch (err) {
      if (!isBackground) setData([]);
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEtherTraffic(false);
    const id = setInterval(() => fetchEtherTraffic(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  const toMbps = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : `${(n / 1_000_000).toFixed(2)} Mbps`;
  };

  const toBytes = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
    if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(2)} MB`;
    if (n >= 1_024)         return `${(n / 1_024).toFixed(2)} KB`;
    return `${n} B`;
  };

  const DL_SUFFIXES = ["-download", "-dl", "-down"];
  const UL_SUFFIXES = ["-upload", "-ul", "-up"];

  const getGroupKey = (name = "") => {
    const lower = name.toLowerCase();
    for (const suffix of [...DL_SUFFIXES, ...UL_SUFFIXES]) {
      if (lower.endsWith(suffix)) return name.slice(0, name.length - suffix.length);
    }
    return null;
  };

  const isDownloadQueue = (name = "") => DL_SUFFIXES.some((s) => name.toLowerCase().endsWith(s));

  const groupedRows = useMemo(() => {
    const groups = {};
    const groupRouter = {};
    const standalone = [];
    const groupOrder = [];

    data.forEach((item) => {
      const key = getGroupKey(item.name);
      if (key) {
        if (!groups[key]) {
          groups[key] = { key, download: null, upload: null };
          groupOrder.push(key);
          groupRouter[key] = { name: item.router_name, id: item.router_id };
        }
        if (isDownloadQueue(item.name)) groups[key].download = item;
        else groups[key].upload = item;
      } else {
        standalone.push(item);
      }
    });

    // Data dari backend sudah berurutan per router (router 1 semua port-nya
    // dulu, baru router 2, dst) — jadi cukup nyisipin pemisah tiap kali router
    // ganti, biar keliatan jelas ini "site mana" tanpa perlu ngewarnain kartu.
    const result = [];
    let lastRouterId;
    const maybeRouterSep = (router) => {
      if (router?.id === lastRouterId) return;
      lastRouterId = router?.id;
      result.push({ type: "router-sep", name: router?.name || "Router lain" });
    };

    groupOrder.forEach((key) => {
      const g = groups[key];
      maybeRouterSep(groupRouter[key]);
      result.push({ type: "sep", key });
      if (g.download) result.push({ type: "row", item: g.download, label: "Download", accent: "dl" });
      if (g.upload)   result.push({ type: "row", item: g.upload,   label: "Upload",   accent: "ul" });
    });
    standalone.forEach((item) => {
      maybeRouterSep({ name: item.router_name, id: item.router_id });
      result.push({ type: "row", item, label: null, accent: null });
    });

    return result;
  }, [data]);

  const dlPill = { display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, background: `${DL_COLOR}1a`, color: DL_COLOR, border: `1px solid ${DL_COLOR}40`, padding: "3px 7px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 };
  const ulPill = { ...dlPill, background: `${UL_COLOR}1a`, color: UL_COLOR, border: `1px solid ${UL_COLOR}40` };

  return (
    <>
      <style>{`
        @keyframes lbw-spin  { to { transform: rotate(360deg); } }
        @keyframes lbw-pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.6;transform:scale(1.2);} }
        @keyframes lbw-bar   { 0%{transform:scaleX(0) translateX(0)}50%{transform:scaleX(0.6) translateX(50%)}100%{transform:scaleX(0) translateX(200%)} }
        .lbw-select:focus { border-color: ${T.navy} !important; box-shadow: 0 0 0 3px rgba(26,42,87,0.10) !important; background: #fff !important; outline: none; }
      `}</style>

      {/* Loading bar */}
      {loading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: `linear-gradient(90deg,${T.navy},${T.navyMid},${T.teal})`, animation: "lbw-bar 1.6s ease-in-out infinite", transformOrigin: "left center" }} />
      )}

      <div className="dashboard-content" style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── Header — gaya NOC (panel terang, dot status, judul + subjudul) ── */}
        <div className="dashboard-panel" style={{
          padding: isMobile ? "12px 16px" : "14px 18px", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
              background: refreshing ? "#e9c46a" : T.teal,
              boxShadow: `0 0 0 4px ${refreshing ? "rgba(233,196,106,0.18)" : "rgba(42,157,143,0.18)"}`,
              animation: "lbw-pulse 2s ease-in-out infinite",
            }} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>Live Bandwidth</h2>
              <div style={{ fontSize: 11.5, color: T.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                MikroTik Ethernet · {refreshing ? "memperbarui…" : `update ${lastUpdate || "—"}`}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

          {/* ── Filter bar ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: isMobile ? "10px 16px" : "10px 28px", background: "rgba(26,42,87,0.03)", borderBottom: `1px solid ${T.border}`, gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 11, pointerEvents: "none", zIndex: 1 }}>
                <rect x="1" y="3" width="12" height="8" rx="1.5" stroke={T.muted} strokeWidth="1.3"/>
                <circle cx="4" cy="7" r="0.9" fill={T.muted}/>
                <circle cx="7" cy="7" r="0.9" fill={T.muted}/>
                <circle cx="10" cy="7" r="0.9" fill={T.muted}/>
              </svg>
              <select
                value={routerId}
                onChange={(e) => setRouterId(e.target.value)}
                className="lbw-select"
                style={{ padding: "8px 14px 8px 30px", border: `1px solid ${T.borderMid}`, borderRadius: 10, fontSize: 13, fontWeight: 500, outline: "none", background: T.surfaceAlt, color: T.text, cursor: "pointer", minWidth: 155, fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
              >
                {routerOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px", gap: 14 }}>
              <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTop: `3px solid ${T.navy}`, borderRadius: "50%", animation: "lbw-spin 0.85s linear infinite" }} />
              <p style={{ margin: 0, color: T.muted, fontSize: 13.5, fontWeight: 500 }}>Memuat data bandwidth...</p>
            </div>
          ) : error ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, margin: "20px 24px", padding: "16px 20px", background: "rgba(231,111,81,0.08)", border: "1px solid rgba(231,111,81,0.22)", borderRadius: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(231,111,81,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#b42318" strokeWidth="1.5"/>
                  <path d="M10 6v4M10 14h.01" stroke="#b42318" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#7a1c0e", marginBottom: 3 }}>Gagal memuat data</div>
                <div style={{ fontSize: 12.5, color: "#b42318", lineHeight: 1.5 }}>{error}</div>
              </div>
            </div>
          ) : groupedRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 24px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(26,42,87,0.05)", marginBottom: 14 }}>
                <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="12" stroke="rgba(26,42,87,0.15)" strokeWidth="1.5"/>
                  <path d="M9 19l10-10M19 19L9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{ margin: "0 0 5px", color: T.text, fontSize: 14.5, fontWeight: 600 }}>Tidak ada data live bandwidth</p>
              <p style={{ margin: 0, color: T.muted, fontSize: 13 }}>Coba pilih router yang berbeda</p>
            </div>
          ) : isMobile ? (
            /* ── Mobile cards ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: T.surfaceAlt }}>
              {(() => {
                let rowNum = 0;
                return groupedRows.map((row, index) => {
                  if (row.type === "router-sep") {
                    const rsc = siteColor(row.name);
                    return (
                      <div key={`rsep-${row.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 4px", marginTop: index === 0 ? 0 : 6 }}>
                        <Dot color={rsc} size={7} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: rsc, letterSpacing: "0.02em" }}>{row.name}</span>
                        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rsc}55 0%, transparent 100%)` }} />
                      </div>
                    );
                  }
                  if (row.type === "sep") {
                    return (
                      <div key={`sep-${row.key}-${index}`} style={{ display: "flex", alignItems: "center", padding: "6px 10px", gap: 8, background: "rgba(26,42,87,0.06)", borderRadius: 8 }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke={T.navy} strokeWidth="1.2"/>
                          <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke={T.navy} strokeWidth="1" strokeLinecap="round"/>
                        </svg>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.navy, letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{row.key}</span>
                        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.borderMid} 0%, transparent 100%)` }} />
                      </div>
                    );
                  }

                  rowNum += 1;
                  const { item, label, accent } = row;
                  const isDl = accent === "dl";
                  const accentColor = accent === "dl" ? DL_COLOR : accent === "ul" ? UL_COLOR : T.navy;
                  const rsc = siteColor(item.router_name);
                  const trend = trendMap[`${item.router_id}|${item.name}`] || [];

                  return (
                    <div key={item[".id"] || `${item.name}-${index}`} className="dashboard-stack__item" style={{ padding: "14px", gap: 0 }}>
                      {/* Head */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, borderRadius: 6, background: T.navy, color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{rowNum}</span>
                          <Dot color={rsc} size={6} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: rsc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.router_name || "—"}</span>
                        </div>
                        {label ? (
                          <span style={isDl ? dlPill : ulPill}>{label}</span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", background: "rgba(26,42,87,0.07)", color: T.navy, border: `1px solid ${T.border}`, borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Interface</span>
                        )}
                      </div>

                      {/* Body */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 44, flexShrink: 0 }}>Port</span>
                          <span style={{ display: "inline-block", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || "—"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 44, flexShrink: 0 }}>Rate</span>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: `${accentColor}14`, color: accentColor, border: `1px solid ${accentColor}33` }}>{toMbps(item.rate)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <Sparkline points={trend} color={accentColor} w={140} h={26} />
                        </div>
                      </div>

                      {/* Footer badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}`, padding: "3px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{toBytes(item.bytes)}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            /* ── Desktop table ── */
            <div className="users-table-wrapper" style={{ marginTop: 0, borderRadius: 0, border: "none", borderTop: `1px solid ${T.border}`, overflow: "visible" }}>
              <table className="users-table" style={{ minWidth: 860 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#f0f4fa" }}>
                  <tr>
                    {["#", "Router", "Interface / Port", "Rate", "Tren (2.5 menit)", "Bytes"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let rowNum = 0;
                    return groupedRows.map((row, index) => {
                      if (row.type === "router-sep") {
                        const rsc = siteColor(row.name);
                        return (
                          <tr key={`rsep-${row.name}-${index}`}>
                            <td colSpan={6} style={{ padding: 0, background: `${rsc}0d`, borderTop: index === 0 ? "none" : `2px solid ${rsc}33` }}>
                              <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", gap: 8 }}>
                                <Dot color={rsc} size={8} />
                                <span style={{ fontSize: 13, fontWeight: 800, color: rsc, letterSpacing: "0.02em" }}>{row.name}</span>
                                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${rsc}55 0%, transparent 100%)` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === "sep") {
                        return (
                          <tr key={`sep-${row.key}-${index}`}>
                            <td colSpan={6} style={{ padding: 0, background: "rgba(26,42,87,0.04)", borderTop: `1px solid ${T.border}` }}>
                              <div style={{ display: "flex", alignItems: "center", padding: "7px 16px", gap: 8 }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                  <rect x="1" y="1" width="10" height="10" rx="2" stroke={T.navy} strokeWidth="1.2"/>
                                  <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke={T.navy} strokeWidth="1" strokeLinecap="round"/>
                                </svg>
                                <span style={{ fontSize: 12, fontWeight: 700, color: T.navy, letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{row.key}</span>
                                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.borderMid} 0%, transparent 100%)` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      rowNum += 1;
                      const { item, label, accent } = row;
                      const isDl = accent === "dl";
                      const accentColor = accent === "dl" ? DL_COLOR : accent === "ul" ? UL_COLOR : T.navy;
                      const rsc = siteColor(item.router_name);
                      const trend = trendMap[`${item.router_id}|${item.name}`] || [];

                      return (
                        <tr key={item[".id"] || `${item.name}-${index}`}>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, borderRadius: 6, background: "rgba(26,42,87,0.08)", fontSize: 11, fontWeight: 700, color: T.navy }}>
                              {rowNum}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Dot color={rsc} size={7} />
                              <span style={{ fontSize: 13, color: rsc, fontWeight: 700 }}>{item.router_name || "—"}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {label && <span style={isDl ? dlPill : ulPill}>{label}</span>}
                              <span style={{ display: "inline-block", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || "—"}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: `${accentColor}14`, color: accentColor, border: `1px solid ${accentColor}33` }}>{toMbps(item.rate)}</span>
                          </td>
                          <td>
                            <Sparkline points={trend} color={accentColor} />
                          </td>
                          <td>
                            <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}`, padding: "3px 9px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{toBytes(item.bytes)}</span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="Kembali ke atas"
          style={{ position: "fixed", bottom: 28, right: 20, width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg,${T.navy},${T.navyMid})`, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,42,87,0.36)", zIndex: 9999 }}
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M5 10l5-5 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  );
}
