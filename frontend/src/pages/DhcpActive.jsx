import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../api";

export default function DhcpActive() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [routerId, setRouterId] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdate, setLastUpdate] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const routerOptions = [
    { value: "all", label: "Semua Router" },
    { value: "1", label: "HO Duta Garden" },
    { value: "2", label: "Gudang Jatake" },
    { value: "3", label: "Gudang Ks Tubun" },
    { value: "4", label: "Gudang Rawa Bokor" },
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

  return (
    <>
      <div style={S.page} data-dhcp-active-page="true">
        <div style={S.card}>

          {/* ── Header ── */}
          <div style={S.header} data-section="header">
            <div style={S.headerGlow} />
            <div style={S.headerWave} />
            <div style={S.headerContent}>
              <div style={S.headerLeft}>
                <div style={S.iconWrap}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="4.5" r="2.2" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4"/>
                    <circle cx="3.5" cy="15.5" r="2.2" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4"/>
                    <circle cx="16.5" cy="15.5" r="2.2" stroke="rgba(255,255,255,0.95)" strokeWidth="1.4"/>
                    <path d="M10 6.7v4.8M10 11.5L3.5 13.3M10 11.5L16.5 13.3"
                      stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <h2 style={S.title}>User Active</h2>
                  <p style={S.subtitle}>DHCP lease aktif · monitoring realtime</p>
                </div>
              </div>
              <div style={S.countBadge}>
                <span style={S.countDot} />
                <span style={{ fontWeight: 800, fontSize: 15 }}>{filteredData.length}</span>
                <span style={{ fontWeight: 500, opacity: 0.75, fontSize: 12 }}>aktif</span>
              </div>
            </div>
          </div>

          {/* ── Info Bar ── */}
          <div style={S.infoBar} data-section="infobar">
            <div style={S.infoLeft}>
              <span style={{
                ...S.statusDotSm,
                background: refreshing ? "#f59e0b" : "#10b981",
                boxShadow: `0 0 0 3px ${refreshing ? "rgba(245,158,11,0.18)" : "rgba(16,185,129,0.18)"}`,
              }} />
              <span style={S.infoText}>
                {refreshing ? "Memperbarui..." : `Update: ${lastUpdate || "—"}`}
              </span>
            </div>
            <div style={S.selectWrap}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#64748b" strokeWidth="1.3"/>
                <circle cx="4" cy="7" r="0.9" fill="#64748b"/>
                <circle cx="7" cy="7" r="0.9" fill="#64748b"/>
                <circle cx="10" cy="7" r="0.9" fill="#64748b"/>
              </svg>
              <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={S.select}>
                {routerOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Filter Bar ── */}
          <div style={S.filterBar} data-section="filterbar">
            <div style={S.searchWrap}>
              <svg style={S.searchIcon} width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M7.33 12.67C10.28 12.67 12.67 10.28 12.67 7.33 12.67 4.39 10.28 2 7.33 2 4.39 2 2 4.39 2 7.33 2 10.28 4.39 12.67 7.33 12.67Z"
                  stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 14L11.1 11.1" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                type="text"
                placeholder="Cari IP, MAC, hostname, router..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={S.searchInput}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} style={S.clearBtn}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M3 3l6 6" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
            <div style={S.selectWrap}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                <path d="M2 3.5H12M2 7H12M2 10.5H12" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <select value={rowsPerPage} onChange={(e) => setRowsPerPage(e.target.value)} style={S.selectSmall}>
                <option value="10">10 rows</option>
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="all">Semua</option>
              </select>
            </div>
          </div>

          {/* ── Body ── */}
          {loading ? (
            <div style={S.loadingWrap}>
              <div style={S.spinRing} />
              <p style={S.loadingTxt}>Memuat data DHCP...</p>
            </div>
          ) : error ? (
            <div style={S.errorBox}>
              <div style={S.errorIconWrap}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#dc2626" strokeWidth="1.5"/>
                  <path d="M10 6v4M10 14h.01" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={S.errorTitle}>Gagal memuat data</div>
                <div style={S.errorText}>{error}</div>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              {isMobile ? (
                <div style={S.cardList}>
                  {displayedData.length > 0 ? displayedData.map((item, index) => {
                    const rowNum = rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1;
                    return (
                      <div key={item[".id"] || `${item.address}-${index}`} style={S.mobileCard}>
                        {/* Header row */}
                        <div style={S.mcHead}>
                          <div style={S.mcHeadLeft}>
                            <span style={S.rowNum}>{rowNum}</span>
                            <span style={S.routerDot} />
                            <span style={S.routerName}>{item.router_name || "—"}</span>
                          </div>
                          <span style={S.statusBadge}>
                            <span style={S.statusDot} />
                            {item.status || "Active"}
                          </span>
                        </div>

                        {/* IP + MAC */}
                        <div style={S.mcBody}>
                          <div style={S.dataRow}>
                            <span style={S.dataLabel}>IP</span>
                            <span style={S.ipValue}>{item.address || "—"}</span>
                          </div>
                          <div style={S.dataRow}>
                            <span style={S.dataLabel}>MAC</span>
                            <span style={S.macValue}>{item["mac-address"] || "—"}</span>
                          </div>
                        </div>

                        {/* Hostname + Server */}
                        <div style={S.mcFoot}>
                          <span style={S.hostBadge}>
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ marginRight: 4, flexShrink: 0 }}>
                              <rect x="1" y="1.5" width="8" height="7" rx="1.2" stroke="#233971" strokeWidth="1"/>
                              <path d="M3 4.5h4M3 6.5h2.5" stroke="#233971" strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                            {item["host-name"] || "—"}
                          </span>
                          <span style={S.serverBadge}>{item.server || "—"}</span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={S.emptyWrap}>
                      <div style={S.emptyIconBox}>
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                          <circle cx="14" cy="14" r="12" stroke="rgba(35,57,113,0.15)" strokeWidth="1.5"/>
                          <path d="M9 19l10-10M19 19L9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <p style={S.emptyTxt}>Tidak ada data tersedia</p>
                      <p style={S.emptySubTxt}>Coba ubah filter atau router yang dipilih</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Desktop table */
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width: 52, textAlign: "center" }}>#</th>
                        <th style={S.th}>Router</th>
                        <th style={S.th}>IP Address</th>
                        <th style={S.th}>MAC Address</th>
                        <th style={S.th}>Hostname</th>
                        <th style={S.th}>Server</th>
                        <th style={{ ...S.th, textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedData.length > 0 ? (
                        displayedData.map((item, index) => (
                          <tr key={item[".id"] || `${item.address}-${index}`}
                            style={{ ...S.tr, background: index % 2 === 0 ? "#fff" : "rgba(248,250,252,0.8)" }}>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <span style={S.numCell}>
                                {rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1}
                              </span>
                            </td>
                            <td style={S.td}>
                              <div style={S.routerCell}>
                                <span style={S.routerDotTd} />
                                <span style={{ fontSize: 13, color: "#1e3a5f", fontWeight: 600 }}>
                                  {item.router_name || "—"}
                                </span>
                              </div>
                            </td>
                            <td style={S.td}><span style={S.monoBadge}>{item.address || "—"}</span></td>
                            <td style={S.td}><span style={S.monoGray}>{item["mac-address"] || "—"}</span></td>
                            <td style={S.td}><span style={S.nameBadge}>{item["host-name"] || "—"}</span></td>
                            <td style={S.td}><span style={S.serverBadgeTd}>{item.server || "—"}</span></td>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <span style={S.statusBadge}>
                                <span style={S.statusDot} />
                                {item.status || "Active"}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div style={S.emptyWrap}>
                              <div style={S.emptyIconBox}>
                                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                  <circle cx="14" cy="14" r="12" stroke="rgba(35,57,113,0.15)" strokeWidth="1.5"/>
                                  <path d="M9 19l10-10M19 19L9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                              </div>
                              <p style={S.emptyTxt}>Tidak ada data tersedia</p>
                              <p style={S.emptySubTxt}>Coba ubah filter atau router yang dipilih</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredData.length > 0 && (
                <div style={S.footer} data-section="footer">
                  <span style={S.footerInfo}>
                    Menampilkan&nbsp;<strong>{startRow}–{endRow}</strong>&nbsp;dari&nbsp;<strong>{filteredData.length}</strong>&nbsp;data
                  </span>
                  {rowsPerPage !== "all" && (
                    <div style={S.pagination}>
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ ...S.pageBtn, ...(currentPage === 1 ? S.pageBtnDisabled : {}) }}
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <span style={S.pageInfo}>{currentPage} / {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ ...S.pageBtn, ...(currentPage === totalPages ? S.pageBtnDisabled : {}) }}
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={S.scrollTopBtn}
          title="Kembali ke atas"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M5 10l5-5 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  );
}

const S = {
  page: {
    padding: "20px",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    maxWidth: "100%",
  },

  card: {
    position: "relative",
    background: "#ffffff",
    borderRadius: 20,
    border: "1px solid rgba(35,57,113,0.10)",
    overflow: "hidden",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.8), 0 4px 6px -2px rgba(35,57,113,0.05), 0 20px 48px -8px rgba(35,57,113,0.09)",
  },

  /* Header */
  header: {
    position: "relative",
    zIndex: 1,
    background: "linear-gradient(135deg, #2c4584 0%, #1c2e5a 55%, #0f1e40 100%)",
    padding: "22px 28px",
    overflow: "hidden",
  },

  headerGlow: {
    position: "absolute",
    top: -40, right: -40,
    width: 200, height: 200,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(126,162,255,0.14) 0%, transparent 60%)",
    pointerEvents: "none",
  },

  headerWave: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    opacity: 0.22,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='140' viewBox='0 0 800 140'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.35' stroke-width='1'%3E%3Cpath d='M-40 55C60 18 140 18 240 55S440 92 540 55s260-37 360 0 260 37 360 0'/%3E%3Cpath d='M-40 95C60 58 140 58 240 95S440 132 540 95s260-37 360 0 260 37 360 0'/%3E%3C/g%3E%3C/svg%3E\")",
    backgroundSize: "cover",
    backgroundPosition: "center",
  },

  headerContent: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    background: "linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.08) 100%)",
    border: "1px solid rgba(255,255,255,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
  },

  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: "-0.3px",
    lineHeight: 1.2,
  },

  subtitle: {
    margin: "3px 0 0",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    fontWeight: 400,
  },

  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.11)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff",
    padding: "9px 18px",
    borderRadius: 12,
    backdropFilter: "blur(12px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.10)",
  },

  countDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#00d47e",
    boxShadow: "0 0 0 2.5px rgba(0,212,126,0.28)",
    animation: "pulse 2.2s ease-in-out infinite",
    flexShrink: 0,
  },

  /* Info bar */
  infoBar: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 28px",
    background: "linear-gradient(180deg, rgba(35,57,113,0.035) 0%, #fff 100%)",
    borderBottom: "1px solid rgba(226,232,240,0.8)",
    gap: 12,
    flexWrap: "wrap",
  },

  infoLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  statusDotSm: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
    animation: "pulse 2s ease-in-out infinite",
  },

  infoText: {
    fontSize: 12.5,
    color: "#6b7280",
    fontWeight: 500,
  },

  /* Filter bar */
  filterBar: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 28px",
    gap: 12,
    flexWrap: "wrap",
    background: "#fff",
    borderBottom: "1px solid rgba(226,232,240,0.8)",
  },

  selectWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  selectIcon: {
    position: "absolute",
    left: 11,
    pointerEvents: "none",
    zIndex: 1,
  },

  select: {
    padding: "9px 14px 9px 32px",
    border: "1px solid rgba(35,57,113,0.16)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    outline: "none",
    background: "#f8fafc",
    color: "#1e3a5f",
    cursor: "pointer",
    minWidth: 160,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  },

  selectSmall: {
    padding: "9px 14px 9px 32px",
    border: "1px solid rgba(35,57,113,0.16)",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    outline: "none",
    background: "#f8fafc",
    color: "#1e3a5f",
    cursor: "pointer",
    minWidth: 115,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  },

  searchWrap: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    maxWidth: 440,
  },

  searchIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
  },

  searchInput: {
    width: "100%",
    padding: "9px 36px 9px 36px",
    border: "1px solid rgba(35,57,113,0.16)",
    borderRadius: 10,
    fontSize: 13,
    outline: "none",
    background: "#f8fafc",
    color: "#374151",
    boxSizing: "border-box",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    transition: "all 0.18s",
  },

  clearBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: 2,
  },

  /* Loading */
  loadingWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "72px 24px",
    gap: 14,
  },

  spinRing: {
    width: 38,
    height: 38,
    border: "3px solid rgba(35,57,113,0.08)",
    borderTop: "3px solid #233971",
    borderRadius: "50%",
    animation: "spin 0.85s linear infinite",
  },

  loadingTxt: {
    margin: 0,
    color: "#9ca3af",
    fontSize: 13.5,
    fontWeight: 500,
  },

  /* Error */
  errorBox: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    margin: "20px 24px",
    padding: "16px 20px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 12,
  },

  errorIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: "#fee2e2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  errorTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "#991b1b",
    marginBottom: 3,
  },

  errorText: {
    fontSize: 12.5,
    color: "#dc2626",
    lineHeight: 1.5,
  },

  /* Mobile card list */
  cardList: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 12px 16px",
    background: "#f1f5f9",
  },

  mobileCard: {
    background: "#fff",
    border: "1px solid rgba(35,57,113,0.08)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(35,57,113,0.06), 0 4px 10px rgba(35,57,113,0.04)",
  },

  mcHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "linear-gradient(135deg, rgba(35,57,113,0.04) 0%, rgba(35,57,113,0.02) 100%)",
    borderBottom: "1px solid rgba(35,57,113,0.07)",
    gap: 8,
  },

  mcHeadLeft: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
  },

  rowNum: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    background: "#233971",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
  },

  routerDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#10b981",
    boxShadow: "0 0 0 2px rgba(16,185,129,0.20)",
    flexShrink: 0,
    animation: "pulse 2.2s ease-in-out infinite",
  },

  routerName: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "#1e3a5f",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    background: "rgba(16,185,129,0.09)",
    color: "#065f46",
    border: "1px solid rgba(16,185,129,0.22)",
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#10b981",
    animation: "pulse 2.2s ease-in-out infinite",
    flexShrink: 0,
  },

  mcBody: {
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 7,
    borderBottom: "1px solid rgba(241,245,249,1)",
  },

  dataRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  dataLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    flexShrink: 0,
    minWidth: 34,
  },

  ipValue: {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    fontWeight: 700,
    color: "#233971",
    letterSpacing: "0.03em",
    textAlign: "right",
  },

  macValue: {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: "#64748b",
    letterSpacing: "0.04em",
    textAlign: "right",
  },

  mcFoot: {
    padding: "9px 14px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },

  hostBadge: {
    display: "inline-flex",
    alignItems: "center",
    background: "rgba(35,57,113,0.07)",
    color: "#233971",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 11.5,
    fontWeight: 600,
    border: "1px solid rgba(35,57,113,0.13)",
  },

  serverBadge: {
    display: "inline-flex",
    alignItems: "center",
    background: "#f1f5f9",
    color: "#475569",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 11.5,
    fontWeight: 600,
    border: "1px solid #e2e8f0",
  },

  /* Empty state */
  emptyWrap: {
    textAlign: "center",
    padding: "56px 24px",
  },

  emptyIconBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "rgba(35,57,113,0.05)",
    marginBottom: 14,
  },

  emptyTxt: {
    margin: "0 0 5px",
    color: "#374151",
    fontSize: 14.5,
    fontWeight: 600,
  },

  emptySubTxt: {
    margin: 0,
    color: "#94a3b8",
    fontSize: 13,
  },

  /* Desktop table */
  tableWrap: {
    position: "relative",
    zIndex: 1,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 620,
  },

  th: {
    padding: "12px 16px",
    background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
    fontSize: 10.5,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
    textAlign: "left",
  },

  tr: { transition: "background 0.12s" },

  td: {
    padding: "11px 16px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  },

  numCell: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 24,
    borderRadius: 6,
    background: "rgba(35,57,113,0.08)",
    fontSize: 11.5,
    fontWeight: 700,
    color: "#233971",
  },

  routerCell: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  routerDotTd: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#10b981",
    boxShadow: "0 0 0 2px rgba(16,185,129,0.18)",
    flexShrink: 0,
  },

  monoBadge: {
    display: "inline-block",
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #dbeafe",
    padding: "3px 10px",
    borderRadius: 7,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: "monospace",
    letterSpacing: "0.03em",
  },

  monoGray: {
    display: "inline-block",
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #e2e8f0",
    padding: "3px 10px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "monospace",
    letterSpacing: "0.03em",
  },

  nameBadge: {
    display: "inline-block",
    background: "rgba(35,57,113,0.07)",
    color: "#233971",
    padding: "3px 10px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(35,57,113,0.13)",
  },

  serverBadgeTd: {
    display: "inline-block",
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #e2e8f0",
    padding: "3px 10px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
  },

  /* Footer */
  footer: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 28px",
    background: "#f8fafc",
    borderTop: "1px solid #f1f5f9",
    gap: 12,
    flexWrap: "wrap",
  },

  footerInfo: {
    fontSize: 12.5,
    color: "#6b7280",
    fontWeight: 500,
  },

  pagination: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  pageBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    border: "1px solid #e2e8f0",
    borderRadius: 9,
    background: "#fff",
    color: "#374151",
    cursor: "pointer",
    transition: "all 0.15s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },

  pageBtnDisabled: {
    opacity: 0.3,
    cursor: "not-allowed",
  },

  pageInfo: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
    padding: "0 8px",
    minWidth: 58,
    textAlign: "center",
  },

  /* Scroll to top */
  scrollTopBtn: {
    position: "fixed",
    bottom: 28,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #233971 0%, #1a2d5a 100%)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(35,57,113,0.38)",
    zIndex: 9999,
    transition: "transform 0.18s, box-shadow 0.18s",
  },
};

const sheet = document.createElement("style");
sheet.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.6;transform:scale(1.15);} }

  [data-dhcp-active-page="true"] table tbody tr:hover td {
    background-color: rgba(35,57,113,0.03) !important;
  }
  [data-dhcp-active-page="true"] select:focus,
  [data-dhcp-active-page="true"] input:focus {
    border-color: #233971 !important;
    box-shadow: 0 0 0 3px rgba(35,57,113,0.10) !important;
    background: #fff !important;
    outline: none;
  }
  [data-dhcp-active-page="true"] button:not(:disabled):hover {
    background: rgba(35,57,113,0.05) !important;
    border-color: rgba(35,57,113,0.30) !important;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(35,57,113,0.12) !important;
  }
  [data-dhcp-active-page="true"] button:not(:disabled):active {
    transform: translateY(0);
  }

  button[title="Kembali ke atas"]:hover {
    transform: translateY(-3px) scale(1.04) !important;
    box-shadow: 0 8px 24px rgba(35,57,113,0.48) !important;
  }

  @media (max-width: 640px) {
    [data-dhcp-active-page="true"] { padding: 0 !important; }

    [data-dhcp-active-page="true"] > div:first-child {
      border-radius: 16px !important;
      margin: 0 4px !important;
    }

    [data-dhcp-active-page="true"] [data-section="header"] {
      padding: 18px 16px !important;
    }

    [data-dhcp-active-page="true"] [data-section="infobar"] {
      padding: 9px 16px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 8px !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] {
      padding: 11px 12px !important;
      flex-direction: column !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] > div:first-child {
      width: 100% !important;
      max-width: 100% !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] input {
      max-width: 100% !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] select {
      width: 100% !important;
      min-width: 0 !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] > div:last-child {
      width: 100% !important;
    }

    [data-dhcp-active-page="true"] [data-section="footer"] {
      padding: 12px 14px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 10px !important;
    }

    button[title="Kembali ke atas"] {
      bottom: calc(74px + 44px + env(safe-area-inset-bottom, 0px)) !important;
      right: 16px !important;
    }
  }
`;
document.head.appendChild(sheet);
