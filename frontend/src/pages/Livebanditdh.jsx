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

const usageColor = (pct) => {
  if (pct >= 85) return { text: "#b42318", bg: "rgba(231,111,81,0.12)", border: "rgba(231,111,81,0.28)", bar: "#e76f51" };
  if (pct >= 60) return { text: "#8a680f", bg: "rgba(233,196,106,0.18)", border: "rgba(233,196,106,0.35)", bar: "#e9c46a" };
  return         { text: "#18786e", bg: "rgba(42,157,143,0.12)", border: "rgba(42,157,143,0.28)", bar: "#2a9d8f" };
};

const LEGEND = [
  { label: "< 60%",   bg: "rgba(42,157,143,0.12)",  color: "#18786e", border: "rgba(42,157,143,0.28)" },
  { label: "60–84%",  bg: "rgba(233,196,106,0.18)", color: "#8a680f", border: "rgba(233,196,106,0.35)" },
  { label: "≥ 85%",   bg: "rgba(231,111,81,0.12)",  color: "#b42318", border: "rgba(231,111,81,0.28)" },
];

function UsageBar({ pct, col }) {
  return (
    <div style={{ minWidth: 96 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: col.text, display: "block", marginBottom: 4 }}>
        {pct.toFixed(1)}%
      </span>
      <div style={{ height: 5, borderRadius: 99, background: T.border, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: col.bar, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

export default function LiveBandwidth() {
  const [data, setData]               = useState([]);
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

  const fetchQueueTree = async (isBackground = false) => {
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      const url =
        routerId === "all"
          ? buildApiUrl("/api/mikrotik/queue-tree")
          : buildApiUrl(`/api/mikrotik/queue-tree?router_id=${routerId}`);

      const res = await fetch(url);
      let rawText = "";
      try { rawText = await res.text(); } catch {}
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.message || parsed?.error || rawText || "Gagal mengambil data");
      }

      const rows = parsed?.data || [];
      setData(Array.isArray(rows) ? rows : []);
      setLastUpdate(new Date().toLocaleString("id-ID"));
    } catch (err) {
      if (!isBackground) setData([]);
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueueTree(false);
    const id = setInterval(() => fetchQueueTree(true), 5000);
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

  const usagePct = (rate, maxLimit) => {
    const r = Number(rate) || 0;
    const m = Number(maxLimit) || 0;
    if (!m) return 0;
    return Math.min((r / m) * 100, 100);
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
    const standalone = [];
    const groupOrder = [];

    data.forEach((item) => {
      const key = getGroupKey(item.name);
      if (key) {
        if (!groups[key]) { groups[key] = { key, download: null, upload: null }; groupOrder.push(key); }
        if (isDownloadQueue(item.name)) groups[key].download = item;
        else groups[key].upload = item;
      } else {
        standalone.push(item);
      }
    });

    const result = [];
    groupOrder.forEach((key) => {
      const g = groups[key];
      result.push({ type: "sep", key });
      if (g.download) result.push({ type: "row", item: g.download, label: "Download", accent: "dl" });
      if (g.upload)   result.push({ type: "row", item: g.upload,   label: "Upload",   accent: "ul" });
    });
    standalone.forEach((item) => result.push({ type: "row", item, label: null, accent: null }));

    return result;
  }, [data]);

  const dlPill = { display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, background: "rgba(26,42,87,0.10)", color: T.navy, border: `1px solid rgba(26,42,87,0.20)`, padding: "3px 7px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 };
  const ulPill = { ...dlPill, background: "rgba(26,42,87,0.06)", color: T.navyMid, border: `1px solid rgba(26,42,87,0.14)` };

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

      <div className="dashboard-content" style={{ height: "100%", overflow: "hidden" }}>
        <div className="dashboard-panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>

          {/* ── Info bar ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 16px" : "10px 28px", background: "rgba(26,42,87,0.03)", borderBottom: `1px solid ${T.border}`, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", animation: "lbw-pulse 2s ease-in-out infinite", background: refreshing ? "#e9c46a" : "#2a9d8f", boxShadow: refreshing ? "0 0 0 3px rgba(233,196,106,0.22)" : "0 0 0 3px rgba(42,157,143,0.20)" }} />
              <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 500 }}>
                {refreshing ? "Memperbarui..." : `Update: ${lastUpdate || "—"}`}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Indikator:</span>
                {LEGEND.map((l) => (
                  <span key={l.label} style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: l.bg, color: l.color, border: `1px solid ${l.border}` }}>
                    {l.label}
                  </span>
                ))}
              </div>

              {/* Router select */}
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
                  const pct = usagePct(item.rate, item["max-limit"]);
                  const col = usageColor(pct);

                  return (
                    <div key={item[".id"] || `${item.name}-${index}`} className="dashboard-stack__item" style={{ padding: "14px", gap: 0 }}>
                      {/* Head */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, borderRadius: 6, background: T.navy, color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{rowNum}</span>
                          <Dot color="#2a9d8f" size={6} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.router_name || "—"}</span>
                        </div>
                        {label ? (
                          <span style={isDl ? dlPill : ulPill}>{label}</span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", background: "rgba(26,42,87,0.07)", color: T.navy, border: `1px solid ${T.border}`, borderRadius: 99, fontSize: 11, fontWeight: 700 }}>Queue</span>
                        )}
                      </div>

                      {/* Body */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 44, flexShrink: 0 }}>Queue</span>
                          <span style={{ display: "inline-block", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || "—"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 44, flexShrink: 0 }}>Rate</span>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>{toMbps(item.rate)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: col.text, fontWeight: 700, minWidth: 38 }}>{pct.toFixed(1)}%</span>
                          <div style={{ flex: 1, height: 5, borderRadius: 99, background: T.border, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: col.bar, borderRadius: 99, transition: "width 0.4s ease" }} />
                          </div>
                        </div>
                      </div>

                      {/* Footer badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        {[toMbps(item["limit-at"]), toMbps(item["max-limit"])].map((v, i) => (
                          <span key={i} style={{ display: "inline-flex", alignItems: "center", background: T.surfaceAlt, color: T.textSoft, padding: "3px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${T.border}` }}>{v}</span>
                        ))}
                        <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}`, padding: "3px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{toBytes(item.bytes)}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: "rgba(26,42,87,0.07)", fontSize: 12, fontWeight: 700, color: T.navy }}>{item.priority || "-"}</span>
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
                    {["#", "Router", "Queue Name", "Priority", "Limit At", "Max Limit", "Rate", "Usage", "Bytes"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let rowNum = 0;
                    return groupedRows.map((row, index) => {
                      if (row.type === "sep") {
                        return (
                          <tr key={`sep-${row.key}-${index}`}>
                            <td colSpan={9} style={{ padding: 0, background: "rgba(26,42,87,0.04)", borderTop: `1px solid ${T.border}` }}>
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
                      const pct = usagePct(item.rate, item["max-limit"]);
                      const col = usageColor(pct);

                      return (
                        <tr key={item[".id"] || `${item.name}-${index}`}>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, borderRadius: 6, background: "rgba(26,42,87,0.08)", fontSize: 11, fontWeight: 700, color: T.navy }}>
                              {rowNum}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Dot color="#2a9d8f" size={7} />
                              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{item.router_name || "—"}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {label && <span style={isDl ? dlPill : ulPill}>{label}</span>}
                              <span style={{ display: "inline-block", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || "—"}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: "rgba(26,42,87,0.07)", fontSize: 12, fontWeight: 700, color: T.navy }}>{item.priority || "-"}</span>
                          </td>
                          <td>
                            <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, padding: "3px 10px", borderRadius: 7, fontSize: 12 }}>{toMbps(item["limit-at"])}</span>
                          </td>
                          <td>
                            <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, padding: "3px 10px", borderRadius: 7, fontSize: 12 }}>{toMbps(item["max-limit"])}</span>
                          </td>
                          <td>
                            <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>{toMbps(item.rate)}</span>
                          </td>
                          <td>
                            <UsageBar pct={pct} col={col} />
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
