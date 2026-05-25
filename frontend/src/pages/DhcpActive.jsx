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

export default function DhcpActive() {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [routerId, setRouterId]       = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
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

  const fetchDhcpActive = async (isBackground = false) => {
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      const url =
        routerId === "all"
          ? buildApiUrl("/api/mikrotik/dhcp-active")
          : buildApiUrl(`/api/mikrotik/dhcp-active?router_id=${routerId}`);

      const res = await fetch(url);
      let rawText = "";
      try { rawText = await res.text(); } catch {}
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        throw new Error(
          parsed?.detail || parsed?.message || parsed?.error ||
          rawText || "Gagal mengambil data user active"
        );
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
    fetchDhcpActive(false);
    const id = setInterval(() => fetchDhcpActive(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, routerId, rowsPerPage]);

  const filteredData = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return data;
    return data.filter((item) =>
      [item.router_name, item.address, item["mac-address"], item["host-name"], item.server, item.status]
        .some((v) => String(v || "").toLowerCase().includes(keyword))
    );
  }, [data, searchTerm]);

  const totalPages =
    rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(filteredData.length / Number(rowsPerPage)));

  const displayedData = useMemo(() => {
    if (rowsPerPage === "all") return filteredData;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return filteredData.slice(start, start + Number(rowsPerPage));
  }, [filteredData, rowsPerPage, currentPage]);

  const startRow = filteredData.length === 0 ? 0 : rowsPerPage === "all" ? 1 : (currentPage - 1) * Number(rowsPerPage) + 1;
  const endRow   = filteredData.length === 0 ? 0 : rowsPerPage === "all" ? filteredData.length : Math.min(currentPage * Number(rowsPerPage), filteredData.length);

  const rowNum = (index) =>
    rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1;

  return (
    <>
      <style>{`
        @keyframes dhcp-spin   { to { transform: rotate(360deg); } }
        @keyframes dhcp-pulse  { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.6;transform:scale(1.2);} }
        @keyframes dhcp-bar    { 0%{transform:scaleX(0) translateX(0)}50%{transform:scaleX(0.6) translateX(50%)}100%{transform:scaleX(0) translateX(200%)} }
        .dhcp-select:focus, .dhcp-input:focus {
          border-color: ${T.navy} !important;
          box-shadow: 0 0 0 3px rgba(26,42,87,0.10) !important;
          background: #fff !important;
          outline: none;
        }
      `}</style>

      {/* Loading bar */}
      {loading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: `linear-gradient(90deg,${T.navy},${T.navyMid},${T.teal})`, animation: "dhcp-bar 1.6s ease-in-out infinite", transformOrigin: "left center" }} />
      )}

      <div className="dashboard-content" style={{ height: "100%", overflow: "hidden" }}>
        <div className="dashboard-panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>

          {/* ── Info / router selector bar ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "10px 16px" : "10px 28px", background: "rgba(26,42,87,0.03)", borderBottom: `1px solid ${T.border}`, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block", animation: "dhcp-pulse 2s ease-in-out infinite", background: refreshing ? "#e9c46a" : "#2a9d8f", boxShadow: refreshing ? "0 0 0 3px rgba(233,196,106,0.22)" : "0 0 0 3px rgba(42,157,143,0.20)" }} />
              <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 500 }}>
                {refreshing ? "Memperbarui..." : `Update: ${lastUpdate || "—"}`}
              </span>
            </div>
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
                className="dhcp-select"
                style={{ padding: "8px 14px 8px 30px", border: `1px solid ${T.borderMid}`, borderRadius: 10, fontSize: 13, fontWeight: 500, outline: "none", background: T.surfaceAlt, color: T.text, cursor: "pointer", minWidth: 155, fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
              >
                {routerOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "11px 16px" : "12px 28px", gap: 12, flexWrap: "wrap", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, maxWidth: 440 }}>
              <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M7.33 12.67C10.28 12.67 12.67 10.28 12.67 7.33 12.67 4.39 10.28 2 7.33 2 4.39 2 2 4.39 2 7.33 2 10.28 4.39 12.67 7.33 12.67Z" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 14L11.1 11.1" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                type="text"
                placeholder="Cari IP, MAC, hostname, router..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="dhcp-input"
                style={{ width: "100%", padding: "9px 36px 9px 36px", border: `1px solid ${T.borderMid}`, borderRadius: 10, fontSize: 13, outline: "none", background: T.surfaceAlt, color: T.text, boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M3 3l6 6" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 11, pointerEvents: "none", zIndex: 1 }}>
                <path d="M2 3.5H12M2 7H12M2 10.5H12" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(e.target.value)}
                className="dhcp-select"
                style={{ padding: "8px 14px 8px 30px", border: `1px solid ${T.borderMid}`, borderRadius: 10, fontSize: 13, fontWeight: 500, outline: "none", background: T.surfaceAlt, color: T.text, cursor: "pointer", minWidth: 115, fontFamily: "inherit", transition: "border-color 0.15s, box-shadow 0.15s" }}
              >
                <option value="10">10 rows</option>
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="all">Semua</option>
              </select>
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px", gap: 14 }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTop: `3px solid ${T.navy}`, borderRadius: "50%", animation: "dhcp-spin 0.85s linear infinite" }} />
                <p style={{ margin: 0, color: T.muted, fontSize: 13.5, fontWeight: 500 }}>Memuat data DHCP...</p>
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
            ) : isMobile ? (
              /* Mobile cards */
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: T.surfaceAlt }}>
                {displayedData.length > 0 ? displayedData.map((item, index) => (
                  <div key={item[".id"] || `${item.address}-${index}`} className="dashboard-stack__item" style={{ padding: "14px", gap: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, borderRadius: 6, background: T.navy, color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{rowNum(index)}</span>
                        <Dot color="#2a9d8f" size={6} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.router_name || "—"}</span>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "rgba(42,157,143,0.10)", color: "#18786e", border: "1px solid rgba(42,157,143,0.22)", borderRadius: 99, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        <Dot color="#2a9d8f" size={5} />{item.status || "Active"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, minWidth: 34 }}>IP</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, fontWeight: 700, color: T.navy, letterSpacing: "0.03em" }}>{item.address || "—"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, minWidth: 34 }}>MAC</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 500, color: T.textSoft, letterSpacing: "0.04em" }}>{item["mac-address"] || "—"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "4px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${T.border}` }}>{item["host-name"] || "—"}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", background: T.surfaceAlt, color: T.textSoft, padding: "4px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${T.border}` }}>{item.server || "—"}</span>
                    </div>
                  </div>
                )) : <EmptyState />}
              </div>
            ) : (
              /* Desktop table */
              <div className="users-table-wrapper" style={{ marginTop: 0, borderRadius: 0, border: "none", borderTop: `1px solid ${T.border}`, overflow: "visible" }}>
                <table className="users-table" style={{ minWidth: 640 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#f0f4fa" }}>
                    <tr>
                      <th style={{ width: 52, textAlign: "center" }}>#</th>
                      <th>Router</th>
                      <th>IP Address</th>
                      <th>MAC Address</th>
                      <th>Hostname</th>
                      <th>Server</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedData.length > 0 ? displayedData.map((item, index) => (
                      <tr key={item[".id"] || `${item.address}-${index}`}>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, borderRadius: 6, background: "rgba(26,42,87,0.08)", fontSize: 11, fontWeight: 700, color: T.navy }}>{rowNum(index)}</span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Dot color="#2a9d8f" size={7} />
                            <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{item.router_name || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: "inline-block", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #dbeafe", padding: "3px 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.03em" }}>{item.address || "—"}</span>
                        </td>
                        <td>
                          <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.03em" }}>{item["mac-address"] || "—"}</span>
                        </td>
                        <td>
                          <span style={{ display: "inline-block", background: "rgba(26,42,87,0.07)", color: T.navy, padding: "3px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}` }}>{item["host-name"] || "—"}</span>
                        </td>
                        <td>
                          <span style={{ display: "inline-block", background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, padding: "3px 10px", borderRadius: 7, fontSize: 12 }}>{item.server || "—"}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "rgba(42,157,143,0.10)", color: "#18786e", border: "1px solid rgba(42,157,143,0.22)", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                            <Dot color="#2a9d8f" size={5} />{item.status || "Active"}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Footer / pagination (pinned) ── */}
          {!loading && !error && filteredData.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "12px 14px" : "14px 28px", background: T.surfaceAlt, borderTop: `1px solid ${T.border}`, gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 500 }}>
                Menampilkan&nbsp;<strong style={{ color: T.text }}>{startRow}–{endRow}</strong>&nbsp;dari&nbsp;<strong style={{ color: T.text }}>{filteredData.length}</strong>&nbsp;data
              </span>
              {rowsPerPage !== "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1px solid ${T.borderMid}`, borderRadius: 9, background: T.surface, color: T.textSoft, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.35 : 1, transition: "all 0.15s" }}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, padding: "0 8px", minWidth: 58, textAlign: "center" }}>{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1px solid ${T.borderMid}`, borderRadius: 9, background: T.surface, color: T.textSoft, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.35 : 1, transition: "all 0.15s" }}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          title="Kembali ke atas"
          style={{ position: "fixed", bottom: 28, right: 20, width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg,${T.navy},${T.navyMid})`, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 4px 16px rgba(26,42,87,0.36)`, zIndex: 9999 }}
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M5 10l5-5 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(26,42,87,0.05)", marginBottom: 14 }}>
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="12" stroke="rgba(26,42,87,0.15)" strokeWidth="1.5"/>
          <path d="M9 19l10-10M19 19L9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={{ margin: "0 0 5px", color: "#374151", fontSize: 14.5, fontWeight: 600 }}>Tidak ada data tersedia</p>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>Coba ubah filter atau router yang dipilih</p>
    </div>
  );
}
