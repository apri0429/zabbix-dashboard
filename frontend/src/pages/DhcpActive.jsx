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
          <div style={S.cardBgAccent} />
          <div style={S.cardBgDots} />

          {/* ── Header ── */}
          <div style={S.header} data-section="header">
            <div style={S.headerLeft}>
              <div style={S.iconWrap}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke="url(#dhcpGrad)" strokeWidth="1.5" />
                  <path d="M11 7v8M7 11h8" stroke="url(#dhcpGrad)" strokeWidth="1.8" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="dhcpGrad" x1="2" y1="2" x2="20" y2="20">
                      <stop stopColor="#5c7cff" />
                      <stop offset="1" stopColor="#233971" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div>
                <h2 style={S.title}>User Active</h2>
                <p style={S.subtitle}>Monitoring koneksi DHCP aktif · realtime</p>
              </div>
            </div>

            <div style={S.headerRight}>
              <span style={S.countBadge}>
                <span style={S.countDot} />
                {filteredData.length} Active
              </span>
            </div>
          </div>

          {/* ── Info bar ── */}
          <div style={S.infoBar} data-section="infobar">
            <div style={S.updateBox}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginRight: 6, flexShrink: 0 }}>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="#233971" strokeWidth="1.2" />
                <path d="M6.5 3.5v3l2 1.5" stroke="#233971" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span style={S.updateLabel}>Update terakhir:</span>
              <span style={S.updateVal}>&nbsp;{lastUpdate || "—"}</span>
              {refreshing && <span style={S.refreshPill}>● memperbarui</span>}
            </div>

            <div style={S.controlsRightMini}>
              <div style={S.selectWrap}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                  <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#233971" strokeWidth="1.3" />
                  <circle cx="4" cy="7" r="1" fill="#233971" />
                  <circle cx="7" cy="7" r="1" fill="#233971" />
                  <circle cx="10" cy="7" r="1" fill="#233971" />
                </svg>
                <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={S.select}>
                  {routerOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div style={S.filterBar} data-section="filterbar">
            <div style={S.filterLeft}>
              <div style={S.searchWrap}>
                <svg style={S.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
                    stroke="#233971" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 14L11.1 11.1" stroke="#233971" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari router, IP, MAC, hostname..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={S.searchInput}
                />
              </div>
            </div>

            <div style={S.filterRight}>
              <div style={S.selectWrap}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                  <path d="M2 3.5H12M2 7H12M2 10.5H12" stroke="#233971" strokeWidth="1.5" strokeLinecap="round" />
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
          </div>

          {/* ── Body ── */}
          {loading ? (
            <div style={S.loadingWrap}>
              <div style={{ position: "relative", width: 52, height: 52 }}>
                <div style={S.spinOuter} />
                <div style={S.spinInner} />
              </div>
              <p style={S.loadingTxt}>Memuat data...</p>
            </div>
          ) : error ? (
            <div style={S.errorBox}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="10" cy="10" r="9" stroke="#dc2626" strokeWidth="1.5" />
                <path d="M10 6v4M10 14h.01" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
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
                        {/* card top */}
                        <div style={S.mobileCardTop}>
                          <div style={S.mobileCardTopLeft}>
                            <span style={S.mobileCardNum}>{rowNum}</span>
                            <div style={S.routerCell}>
                              <div style={S.routerDot} />
                              <span style={S.mobileCardRouter}>{item.router_name || "-"}</span>
                            </div>
                          </div>
                          <span style={S.statusBadge}>
                            <span style={S.statusDot} />
                            {item.status || "Active"}
                          </span>
                        </div>

                        {/* card fields */}
                        <div style={S.mobileCardFields}>
                          <div style={S.mobileField}>
                            <span style={S.mobileFieldLabel}>IP Address</span>
                            <span style={S.monoBadge}>{item.address || "-"}</span>
                          </div>
                          <div style={S.mobileField}>
                            <span style={S.mobileFieldLabel}>MAC Address</span>
                            <span style={S.monoBadge}>{item["mac-address"] || "-"}</span>
                          </div>
                          <div style={S.mobileFieldRow}>
                            <div style={S.mobileFieldHalf}>
                              <span style={S.mobileFieldLabel}>Hostname</span>
                              <span style={S.nameBadge}>{item["host-name"] || "-"}</span>
                            </div>
                            <div style={S.mobileFieldHalf}>
                              <span style={S.mobileFieldLabel}>Server</span>
                              <span style={S.serverBadge}>{item.server || "-"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={S.emptyWrap}>
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="24" r="22" fill="rgba(35,57,113,0.06)" />
                        <path d="M24 16v8M24 30h.02" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
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
                        <th style={S.th}>No</th>
                        <th style={S.th}>Router</th>
                        <th style={S.th}>IP Address</th>
                        <th style={S.th}>MAC Address</th>
                        <th style={S.th}>Hostname</th>
                        <th style={S.th}>Server</th>
                        <th style={S.thCenter}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedData.length > 0 ? (
                        displayedData.map((item, index) => (
                          <tr key={item[".id"] || `${item.address}-${index}`} style={S.tr}>
                            <td style={S.td}>
                              <span style={S.numCell}>
                                {rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1}
                              </span>
                            </td>
                            <td style={S.td}>
                              <div style={S.routerCell}>
                                <div style={S.routerDot} />
                                <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
                                  {item.router_name || "-"}
                                </span>
                              </div>
                            </td>
                            <td style={S.td}><span style={S.monoBadge}>{item.address || "-"}</span></td>
                            <td style={S.td}><span style={S.monoBadge}>{item["mac-address"] || "-"}</span></td>
                            <td style={S.td}><span style={S.nameBadge}>{item["host-name"] || "-"}</span></td>
                            <td style={S.td}><span style={S.serverBadge}>{item.server || "-"}</span></td>
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
                          <td colSpan={7} style={S.emptyCell}>
                            <div style={S.emptyWrap}>
                              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                                <circle cx="24" cy="24" r="22" fill="rgba(35,57,113,0.06)" />
                                <path d="M24 16v8M24 30h.02" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
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
                  <div style={S.footerLeft}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 8 }}>
                      <rect x="2" y="3" width="12" height="10" rx="1" stroke="#233971" strokeWidth="1.5" />
                      <path d="M5 6H11M5 9H8" stroke="#233971" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span style={S.footerInfo}>
                      Menampilkan <strong style={{ margin: "0 3px" }}>{startRow}–{endRow}</strong>
                      dari <strong style={{ margin: "0 3px" }}>{filteredData.length}</strong> data
                    </span>
                  </div>

                  {rowsPerPage !== "all" && (
                    <div style={S.pagination}>
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ ...S.pageBtn, ...(currentPage === 1 ? S.pageBtnDisabled : {}) }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <span style={S.pageInfo}>{currentPage} / {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ ...S.pageBtn, ...(currentPage === totalPages ? S.pageBtnDisabled : {}) }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

      {/* ── Scroll to top button ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={S.scrollTopBtn}
          title="Kembali ke atas"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M5 10l5-5 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  );
}

const S = {
  page: {
    padding: "24px",
    maxWidth: "100%",
  },

  card: {
    position: "relative",
    background: "linear-gradient(160deg,#ffffff 0%,rgba(35,57,113,0.03) 45%,rgba(35,57,113,0.07) 100%)",
    borderRadius: 20,
    border: "1px solid rgba(35,57,113,0.14)",
    borderTop: "1px solid rgba(35,57,113,0.22)",
    overflow: "hidden",
    boxShadow:
      "0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.06),0 20px 40px -8px rgba(0,0,0,0.07)",
  },

  cardBgAccent: {
    position: "absolute",
    top: -60,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: "50%",
    background: "radial-gradient(circle,rgba(35,57,113,0.07) 0%,transparent 65%)",
    pointerEvents: "none",
    zIndex: 0,
  },

  cardBgDots: {
    position: "absolute",
    inset: 0,
    backgroundImage: "radial-gradient(circle,rgba(35,57,113,0.04) 1px,transparent 1px)",
    backgroundSize: "28px 28px",
    backgroundPosition: "14px 14px",
    pointerEvents: "none",
    zIndex: 0,
  },

  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 28px",
    background:
      "linear-gradient(135deg,rgba(35,57,113,0.08) 0%,rgba(35,57,113,0.04) 50%,rgba(249,250,251,0.2) 100%)",
    borderBottom: "1px solid rgba(35,57,113,0.12)",
    gap: 16,
    flexWrap: "wrap",
  },

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 13,
    background: "linear-gradient(135deg,rgba(35,57,113,0.10) 0%,rgba(35,57,113,0.18) 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 6px -1px rgba(35,57,113,0.15)",
  },

  title: {
    margin: 0,
    fontSize: 21,
    fontWeight: 700,
    color: "#0c1a2e",
    letterSpacing: "-0.4px",
  },

  subtitle: {
    margin: "2px 0 0",
    fontSize: 13,
    color: "#6b7280",
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  countBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background: "linear-gradient(135deg,#233971 0%,#1a2d5a 100%)",
    color: "#fff",
    padding: "8px 16px",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 4px 6px -1px rgba(35,57,113,0.30)",
  },

  countDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#fff",
    opacity: 0.85,
    animation: "pulse 2s ease-in-out infinite",
  },

  infoBar: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 28px",
    background: "linear-gradient(180deg,rgba(249,250,251,0.8) 0%,rgba(255,255,255,0.5) 100%)",
    borderBottom: "1px solid rgba(229,231,235,0.7)",
    gap: 12,
    flexWrap: "wrap",
  },

  updateBox: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: "#374151",
  },

  updateLabel: { color: "#6b7280" },

  updateVal: {
    fontWeight: 600,
    color: "#0c1a2e",
  },

  refreshPill: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#233971",
    background: "rgba(35,57,113,0.08)",
    padding: "2px 8px",
    borderRadius: 99,
    animation: "pulse 1.5s ease-in-out infinite",
  },

  controlsRightMini: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  filterBar: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 28px",
    gap: 12,
    flexWrap: "wrap",
    background: "linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(249,250,251,0.75) 100%)",
    borderBottom: "1px solid rgba(229,231,235,0.7)",
  },

  filterLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 200,
  },

  filterRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  selectWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  selectIcon: {
    position: "absolute",
    left: 12,
    pointerEvents: "none",
    zIndex: 1,
  },

  select: {
    padding: "10px 14px 10px 36px",
    border: "1px solid rgba(35,57,113,0.20)",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 500,
    outline: "none",
    background: "#fff",
    color: "#1e3a5f",
    cursor: "pointer",
    minWidth: 170,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.2s",
  },

  selectSmall: {
    padding: "10px 14px 10px 36px",
    border: "1px solid rgba(35,57,113,0.20)",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 500,
    outline: "none",
    background: "#fff",
    color: "#1e3a5f",
    cursor: "pointer",
    minWidth: 120,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.2s",
  },

  searchWrap: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    maxWidth: 460,
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
    padding: "10px 14px 10px 38px",
    border: "1px solid rgba(35,57,113,0.20)",
    borderRadius: 11,
    fontSize: 13,
    outline: "none",
    background: "#fff",
    color: "#374151",
    boxSizing: "border-box",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.2s",
  },

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

  spinOuter: {
    position: "absolute",
    width: 52,
    height: 52,
    border: "4px solid rgba(35,57,113,0.08)",
    borderTop: "4px solid #233971",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  spinInner: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 36,
    height: 36,
    border: "3px solid rgba(35,57,113,0.06)",
    borderBottom: "3px solid #3d5ca8",
    borderRadius: "50%",
    animation: "spin 1.5s linear infinite reverse",
  },

  loadingTxt: {
    margin: "60px 0 0",
    color: "#6b7280",
    fontSize: 14,
    fontWeight: 500,
  },

  errorBox: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    margin: 28,
    padding: "18px 22px",
    background: "linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)",
    border: "1px solid #fecaca",
    borderRadius: 14,
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#991b1b",
    marginBottom: 4,
  },

  errorText: {
    fontSize: 13,
    color: "#dc2626",
    lineHeight: "1.6",
  },

  /* ── Mobile card list ── */
  cardList: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 12px 16px",
    background: "rgba(35,57,113,0.025)",
  },

  mobileCard: {
    background: "#fff",
    border: "1px solid rgba(35,57,113,0.11)",
    borderRadius: 14,
    padding: "14px 16px",
    boxShadow: "0 2px 8px rgba(35,57,113,0.07)",
    transition: "box-shadow 0.15s",
  },

  mobileCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },

  mobileCardTopLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },

  mobileCardNum: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 24,
    borderRadius: 6,
    background: "rgba(35,57,113,0.09)",
    fontSize: 11,
    fontWeight: 700,
    color: "#233971",
    flexShrink: 0,
  },

  mobileCardRouter: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1e3a5f",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  mobileCardFields: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  mobileField: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  mobileFieldRow: {
    display: "flex",
    gap: 10,
  },

  mobileFieldHalf: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },

  mobileFieldLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    flexShrink: 0,
    minWidth: 80,
  },

  /* ── Desktop table ── */
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
    padding: "13px 14px",
    background: "linear-gradient(180deg,rgba(35,57,113,0.07) 0%,rgba(249,250,251,0.85) 100%)",
    fontSize: 11,
    fontWeight: 700,
    color: "#1e3a5f",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    borderBottom: "2px solid rgba(35,57,113,0.14)",
    whiteSpace: "nowrap",
    textAlign: "left",
  },

  thCenter: {
    padding: "13px 14px",
    background: "linear-gradient(180deg,rgba(35,57,113,0.07) 0%,rgba(249,250,251,0.85) 100%)",
    fontSize: 11,
    fontWeight: 700,
    color: "#1e3a5f",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
    borderBottom: "2px solid rgba(35,57,113,0.14)",
    whiteSpace: "nowrap",
    textAlign: "center",
  },

  tr: { transition: "background 0.15s" },

  td: {
    padding: "12px 14px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid rgba(243,244,246,0.95)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  },

  numCell: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 26,
    height: 26,
    borderRadius: 7,
    background: "rgba(35,57,113,0.08)",
    fontSize: 12,
    fontWeight: 700,
    color: "#233971",
  },

  routerCell: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  routerDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#00c875",
    boxShadow: "0 0 0 2px rgba(0,200,117,0.20)",
    flexShrink: 0,
  },

  monoBadge: {
    display: "inline-block",
    background: "#f8fafc",
    color: "#334155",
    border: "1px solid #e2e8f0",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "monospace",
  },

  nameBadge: {
    display: "inline-block",
    background: "linear-gradient(135deg,rgba(35,57,113,0.08) 0%,rgba(35,57,113,0.13) 100%)",
    color: "#233971",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(35,57,113,0.18)",
  },

  serverBadge: {
    display: "inline-block",
    background: "rgba(35,57,113,0.05)",
    color: "#1e3a5f",
    border: "1px solid rgba(35,57,113,0.15)",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 12px",
    background: "rgba(0,200,117,0.10)",
    color: "#065f46",
    border: "1px solid rgba(0,200,117,0.30)",
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#00c875",
    boxShadow: "0 0 0 2px rgba(0,200,117,0.20)",
    animation: "pulse 2s ease-in-out infinite",
  },

  emptyCell: { padding: 0 },

  emptyWrap: {
    textAlign: "center",
    padding: "60px 24px",
  },

  emptyTxt: {
    margin: "12px 0 4px",
    color: "#6b7280",
    fontSize: 15,
    fontWeight: 600,
  },

  emptySubTxt: {
    margin: 0,
    color: "#9ca3af",
    fontSize: 13,
  },

  footer: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 28px",
    background: "linear-gradient(180deg,rgba(255,255,255,0.6) 0%,rgba(249,250,251,0.8) 100%)",
    borderTop: "1px solid rgba(229,231,235,0.7)",
    gap: 12,
    flexWrap: "wrap",
  },

  footerLeft: {
    display: "flex",
    alignItems: "center",
  },

  footerInfo: {
    fontSize: 13,
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
  },

  pagination: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  pageBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    border: "1px solid rgba(35,57,113,0.20)",
    borderRadius: 10,
    background: "#fff",
    color: "#233971",
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },

  pageBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },

  pageInfo: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
    padding: "0 10px",
    minWidth: 70,
    textAlign: "center",
  },

  /* ── Scroll to top ── */
  scrollTopBtn: {
    position: "fixed",
    bottom: 24,
    right: 20,
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#233971 0%,#1a2d5a 100%)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(35,57,113,0.40)",
    zIndex: 9999,
    transition: "transform 0.2s, box-shadow 0.2s",
  },
};

const sheet = document.createElement("style");
sheet.textContent = `
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.65;transform:scale(1.12);} }

  [data-dhcp-active-page="true"] table tbody tr:hover td {
    background-color: rgba(35,57,113,0.025) !important;
  }
  [data-dhcp-active-page="true"] [data-section="cardlist"] > div:hover {
    background: rgba(35,57,113,0.025) !important;
  }
  [data-dhcp-active-page="true"] select:focus,
  [data-dhcp-active-page="true"] input:focus {
    border-color: #233971 !important;
    box-shadow: 0 0 0 3px rgba(35,57,113,0.12) !important;
    outline: none;
  }
  [data-dhcp-active-page="true"] button:not(:disabled):hover {
    background: rgba(35,57,113,0.06) !important;
    border-color: #233971 !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(35,57,113,0.16) !important;
  }
  [data-dhcp-active-page="true"] button:not(:disabled):active {
    transform: translateY(0);
  }

  /* scroll to top hover */
  button[title="Kembali ke atas"]:hover {
    transform: translateY(-3px) !important;
    box-shadow: 0 8px 24px rgba(35,57,113,0.50) !important;
  }

  @media (max-width: 640px) {
    [data-dhcp-active-page="true"] { padding: 0 !important; }

    [data-dhcp-active-page="true"] > div:first-child {
      border-radius: 18px !important;
      margin: 0 4px !important;
    }

    [data-dhcp-active-page="true"] [data-section="header"] {
      padding: 18px 16px !important;
    }

    [data-dhcp-active-page="true"] [data-section="infobar"] {
      padding: 10px 16px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 8px !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] {
      padding: 12px 16px !important;
      flex-direction: column !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] > div:first-child {
      width: 100% !important;
      min-width: 0 !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] > div:last-child {
      width: 100% !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] select {
      width: 100% !important;
      min-width: 0 !important;
    }

    [data-dhcp-active-page="true"] [data-section="filterbar"] input {
      max-width: 100% !important;
    }

    [data-dhcp-active-page="true"] [data-section="footer"] {
      padding: 14px 16px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 10px !important;
    }

    button[title="Kembali ke atas"] {
      bottom: 90px !important;
    }
  }
`;
document.head.appendChild(sheet);
