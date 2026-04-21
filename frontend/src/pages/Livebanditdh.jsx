import { useEffect, useState, useMemo } from "react";
import { buildApiUrl } from "../api";

export default function LiveBandwidth() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [routerId, setRouterId] = useState("all");
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
        throw new Error(
          parsed?.detail || parsed?.message || parsed?.error || rawText || "Gagal mengambil data"
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
    fetchQueueTree(false);
    const id = setInterval(() => fetchQueueTree(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  const toMbps = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    return isNaN(n) ? String(v) : `${(n / 1_000_000).toFixed(2)} Mbps`;
  };

  const toBytes = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    if (isNaN(n)) return String(v);
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

  const usageColor = (pct) => {
    if (pct >= 85) return { text:"#b91c1c", bg:"#fee2e2", border:"#fecaca", bar:"#ef4444" };
    if (pct >= 60) return { text:"#b45309", bg:"#fef3c7", border:"#fde68a", bar:"#f59e0b" };
    return           { text:"#065f46", bg:"#d1fae5", border:"#6ee7b7", bar:"#10b981" };
  };

  const DL_SUFFIXES = ["-download", "-dl", "-down"];
  const UL_SUFFIXES = ["-upload", "-ul", "-up"];

  const getGroupKey = (name = "") => {
    const lower = name.toLowerCase();
    for (const s of [...DL_SUFFIXES, ...UL_SUFFIXES]) {
      if (lower.endsWith(s)) return name.slice(0, name.length - s.length);
    }
    return null;
  };

  const isDownloadQueue = (name = "") => {
    const l = name.toLowerCase();
    return DL_SUFFIXES.some((s) => l.endsWith(s));
  };

  const groupedRows = useMemo(() => {
    const groups = {};
    const standalone = [];
    const groupOrder = [];

    data.forEach((item) => {
      const key = getGroupKey(item.name);
      if (key) {
        if (!groups[key]) {
          groups[key] = { key, download: null, upload: null };
          groupOrder.push(key);
        }
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
    standalone.forEach((item) => {
      result.push({ type: "row", item, label: null, accent: null });
    });

    return result;
  }, [data]);

  return (
    <>
      <div style={S.page} data-live-bw-page="true">
        <div style={S.card}>
          <div style={S.cardBgAccent} />
          <div style={S.cardBgDots} />

          {/* ── Header ── */}
          <div style={S.header} data-section="header">
            <div style={S.headerLeft}>
              <div style={S.iconWrap}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke="url(#hg)" strokeWidth="1.5"/>
                  <path d="M11 7v4M8 13l3 3 3-3" stroke="url(#hg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="hg" x1="2" y1="2" x2="20" y2="20">
                      <stop stopColor="#5c7cff"/>
                      <stop offset="1" stopColor="#233971"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div>
                <h2 style={S.title}>Live Bandwidth</h2>
                <p style={S.subtitle}>Monitoring queue tree per router · realtime</p>
              </div>
            </div>
            <div style={S.headerRight}>
              <div style={S.selectWrap}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                  <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#233971" strokeWidth="1.3"/>
                  <circle cx="4" cy="7" r="1" fill="#233971"/>
                  <circle cx="7" cy="7" r="1" fill="#233971"/>
                  <circle cx="10" cy="7" r="1" fill="#233971"/>
                </svg>
                <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={S.select}>
                  {routerOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <span style={S.countBadge}>
                <span style={S.countDot} />
                {data.length} Queue
              </span>
            </div>
          </div>

          {/* ── Info bar ── */}
          <div style={S.infoBar} data-section="infobar">
            <div style={S.updateBox}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{marginRight:6,flexShrink:0}}>
                <circle cx="6.5" cy="6.5" r="5.5" stroke="#233971" strokeWidth="1.2"/>
                <path d="M6.5 3.5v3l2 1.5" stroke="#233971" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span style={S.updateLabel}>Update terakhir:</span>
              <span style={S.updateVal}>&nbsp;{lastUpdate || "—"}</span>
              {refreshing && <span style={S.refreshPill}>● memperbarui</span>}
            </div>
            <div style={S.legend}>
              <span style={S.legendLabel}>Indikator:</span>
              {[
                { label:"< 60%",  bg:"#d1fae5", color:"#065f46", border:"#6ee7b7" },
                { label:"60–84%", bg:"#fef3c7", color:"#b45309", border:"#fde68a" },
                { label:"≥ 85%",  bg:"#fee2e2", color:"#b91c1c", border:"#fecaca" },
              ].map((l) => (
                <span key={l.label} style={{...S.legendChip, background:l.bg, color:l.color, border:`1px solid ${l.border}`}}>
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Body ── */}
          {loading ? (
            <div style={S.loadingWrap}>
              <div style={{position:"relative",width:52,height:52}}>
                <div style={S.spinOuter}/>
                <div style={S.spinInner}/>
              </div>
              <p style={S.loadingTxt}>Memuat data...</p>
            </div>
          ) : error ? (
            <div style={S.errorBox}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}>
                <circle cx="10" cy="10" r="9" stroke="#dc2626" strokeWidth="1.5"/>
                <path d="M10 6v4M10 14h.01" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div>
                <div style={S.errorTitle}>Gagal memuat data</div>
                <div style={S.errorText}>{error}</div>
              </div>
            </div>
          ) : groupedRows.length === 0 ? (
            <div style={S.emptyWrap}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="22" fill="rgba(35,57,113,0.06)"/>
                <path d="M24 16v8M24 30h.02" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <p style={S.emptyTxt}>Tidak ada data live bandwidth</p>
              <p style={S.emptySubTxt}>Coba pilih router yang berbeda</p>
            </div>
          ) : isMobile ? (
            /* ── Mobile cards ── */
            <div style={S.cardList}>
              {(() => {
                let rowNum = 0;
                return groupedRows.map((row, i) => {
                  if (row.type === "sep") {
                    return (
                      <div key={`sep-${row.key}-${i}`} style={S.mobileSep}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{flexShrink:0}}>
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="#233971" strokeWidth="1.2"/>
                          <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke="#233971" strokeWidth="1" strokeLinecap="round"/>
                        </svg>
                        <span style={S.mobileSepLabel}>{row.key}</span>
                        <div style={S.mobileSepLine}/>
                      </div>
                    );
                  }

                  rowNum++;
                  const { item, label, accent } = row;
                  const isDl = accent === "dl";
                  const isUl = accent === "ul";
                  const pct = usagePct(item.rate, item["max-limit"]);
                  const col = usageColor(pct);

                  return (
                    <div key={item[".id"] || `${item.name}-${i}`}
                      style={{ ...S.mobileCard, ...(isDl ? S.mobileCardDl : isUl ? S.mobileCardUl : {}) }}>
                      {/* card top */}
                      <div style={S.mobileCardTop}>
                        <div style={S.mobileCardTopLeft}>
                          <span style={S.mobileCardNum}>{rowNum}</span>
                          {label && (
                            <span style={isDl ? S.dlPill : S.ulPill}>
                              {isDl
                                ? <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{marginRight:3}}>
                                    <path d="M4.5 1v5.5M2 5l2.5 2.5L7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                : <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{marginRight:3}}>
                                    <path d="M4.5 8V2.5M2 4l2.5-2.5L7 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                              }
                              {label}
                            </span>
                          )}
                          <span style={S.nameBadge}>{item.name || "-"}</span>
                        </div>
                        <span style={{...S.rateBadge, background:col.bg, color:col.text, border:`1px solid ${col.border}`}}>
                          {toMbps(item.rate)}
                        </span>
                      </div>

                      {/* usage bar */}
                      <div style={S.mobileUsageRow}>
                        <span style={{fontSize:11,color:col.text,fontWeight:700,minWidth:38}}>{pct.toFixed(1)}%</span>
                        <div style={{flex:1,height:5,borderRadius:99,background:"#f1f5f9",overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:col.bar,borderRadius:99,transition:"width 0.4s ease"}}/>
                        </div>
                      </div>

                      {/* fields */}
                      <div style={S.mobileCardFields}>
                        <div style={S.mobileFieldRow}>
                          <div style={S.mobileFieldHalf}>
                            <span style={S.mobileFieldLabel}>Router</span>
                            <div style={S.routerCell}>
                              <div style={S.routerDot}/>
                              <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{item.router_name || "-"}</span>
                            </div>
                          </div>
                          <div style={S.mobileFieldHalf}>
                            <span style={S.mobileFieldLabel}>Priority</span>
                            <span style={S.prioBadge}>{item.priority || "-"}</span>
                          </div>
                        </div>
                        <div style={S.mobileFieldRow}>
                          <div style={S.mobileFieldHalf}>
                            <span style={S.mobileFieldLabel}>Limit At</span>
                            <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{toMbps(item["limit-at"])}</span>
                          </div>
                          <div style={S.mobileFieldHalf}>
                            <span style={S.mobileFieldLabel}>Max Limit</span>
                            <span style={{fontSize:12,color:"#374151",fontWeight:600}}>{toMbps(item["max-limit"])}</span>
                          </div>
                        </div>
                        <div style={S.mobileField}>
                          <span style={S.mobileFieldLabel}>Bytes</span>
                          <span style={S.bytesBadge}>{toBytes(item.bytes)}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            /* ── Desktop table ── */
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["No","Router","Queue Name","Priority","Limit At","Max Limit","Rate","Usage","Bytes"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let rowNum = 0;
                    return groupedRows.map((row, i) => {
                      if (row.type === "sep") {
                        return (
                          <tr key={`sep-${row.key}-${i}`}>
                            <td colSpan={9} style={S.sepCell}>
                              <div style={S.sepInner}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{flexShrink:0}}>
                                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="#233971" strokeWidth="1.2"/>
                                  <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke="#233971" strokeWidth="1" strokeLinecap="round"/>
                                </svg>
                                <span style={S.sepLabel}>{row.key}</span>
                                <div style={S.sepLine}/>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      rowNum++;
                      const { item, label, accent } = row;
                      const isDl = accent === "dl";
                      const isUl = accent === "ul";
                      const pct = usagePct(item.rate, item["max-limit"]);
                      const col = usageColor(pct);

                      return (
                        <tr key={item[".id"] || `${item.name}-${i}`}
                          style={{ ...S.tr, ...(isDl ? S.trDl : isUl ? S.trUl : {}) }}>
                          <td style={S.td}><span style={S.numCell}>{rowNum}</span></td>
                          <td style={S.td}>
                            <div style={S.routerCell}>
                              <div style={S.routerDot}/>
                              <span style={{fontSize:13,color:"#374151"}}>{item.router_name || "-"}</span>
                            </div>
                          </td>
                          <td style={S.td}>
                            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"nowrap"}}>
                              {label && (
                                <span style={isDl ? S.dlPill : S.ulPill}>
                                  {isDl
                                    ? <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{marginRight:3}}>
                                        <path d="M4.5 1v5.5M2 5l2.5 2.5L7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    : <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{marginRight:3}}>
                                        <path d="M4.5 8V2.5M2 4l2.5-2.5L7 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                  }
                                  {label}
                                </span>
                              )}
                              <span style={S.nameBadge}>{item.name || "-"}</span>
                            </div>
                          </td>
                          <td style={{...S.td,textAlign:"center"}}>
                            <span style={S.prioBadge}>{item.priority || "-"}</span>
                          </td>
                          <td style={S.td}>{toMbps(item["limit-at"])}</td>
                          <td style={S.td}>{toMbps(item["max-limit"])}</td>
                          <td style={S.td}>
                            <span style={{...S.rateBadge, background:col.bg, color:col.text, border:`1px solid ${col.border}`}}>
                              {toMbps(item.rate)}
                            </span>
                          </td>
                          <td style={S.td}><UsageBar pct={pct} col={col}/></td>
                          <td style={S.td}><span style={S.bytesBadge}>{toBytes(item.bytes)}</span></td>
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

      {/* ── Scroll to top ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={S.scrollTopBtn}
          title="Kembali ke atas"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M5 10l5-5 5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </>
  );
}

function UsageBar({ pct, col }) {
  return (
    <div style={{minWidth:96}}>
      <span style={{fontSize:12,fontWeight:700,color:col.text,display:"block",marginBottom:4}}>
        {pct.toFixed(1)}%
      </span>
      <div style={{height:5,borderRadius:99,background:"#f1f5f9",overflow:"hidden"}}>
        <div style={{
          height:"100%", width:`${pct}%`,
          background:col.bar, borderRadius:99,
          transition:"width 0.4s ease",
        }}/>
      </div>
    </div>
  );
}

const S = {
  page: { padding:"24px", maxWidth:"100%" },

  card: {
    position:"relative",
    background:"linear-gradient(160deg,#ffffff 0%,rgba(35,57,113,0.03) 45%,rgba(35,57,113,0.07) 100%)",
    borderRadius:20,
    border:"1px solid rgba(35,57,113,0.14)",
    borderTop:"1px solid rgba(35,57,113,0.22)",
    overflow:"hidden",
    boxShadow:"0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.06),0 20px 40px -8px rgba(0,0,0,0.07)",
  },
  cardBgAccent: {
    position:"absolute",top:-60,left:-60,width:220,height:220,borderRadius:"50%",
    background:"radial-gradient(circle,rgba(35,57,113,0.07) 0%,transparent 65%)",
    pointerEvents:"none",zIndex:0,
  },
  cardBgDots: {
    position:"absolute",inset:0,
    backgroundImage:"radial-gradient(circle,rgba(35,57,113,0.04) 1px,transparent 1px)",
    backgroundSize:"28px 28px",backgroundPosition:"14px 14px",
    pointerEvents:"none",zIndex:0,
  },

  header: {
    position:"relative",zIndex:1,
    display:"flex",justifyContent:"space-between",alignItems:"center",
    padding:"24px 28px",
    background:"linear-gradient(135deg,rgba(35,57,113,0.08) 0%,rgba(35,57,113,0.04) 50%,rgba(249,250,251,0.2) 100%)",
    borderBottom:"1px solid rgba(35,57,113,0.12)",
    gap:16,flexWrap:"wrap",
  },
  headerLeft:  { display:"flex",alignItems:"center",gap:14 },
  iconWrap: {
    width:46,height:46,borderRadius:13,
    background:"linear-gradient(135deg,rgba(35,57,113,0.10) 0%,rgba(35,57,113,0.18) 100%)",
    display:"flex",alignItems:"center",justifyContent:"center",
    boxShadow:"0 4px 6px -1px rgba(35,57,113,0.15)",
  },
  title:    { margin:0,fontSize:21,fontWeight:700,color:"#0c1a2e",letterSpacing:"-0.4px" },
  subtitle: { margin:"2px 0 0",fontSize:13,color:"#6b7280" },
  headerRight: { display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" },

  selectWrap:  { position:"relative",display:"flex",alignItems:"center" },
  selectIcon:  { position:"absolute",left:12,pointerEvents:"none",zIndex:1 },
  select: {
    padding:"10px 14px 10px 36px",
    border:"1px solid rgba(35,57,113,0.20)",borderRadius:11,
    fontSize:13,fontWeight:500,outline:"none",
    background:"#fff",color:"#1e3a5f",cursor:"pointer",
    minWidth:190,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",transition:"all 0.2s",
  },
  countBadge: {
    display:"inline-flex",alignItems:"center",gap:7,
    background:"linear-gradient(135deg,#233971 0%,#1a2d5a 100%)",
    color:"#fff",padding:"8px 16px",borderRadius:11,
    fontSize:13,fontWeight:600,
    boxShadow:"0 4px 6px -1px rgba(35,57,113,0.30)",
  },
  countDot: {
    width:7,height:7,borderRadius:"50%",
    background:"#fff",opacity:0.85,
    animation:"pulse 2s ease-in-out infinite",
  },

  infoBar: {
    position:"relative",zIndex:1,
    display:"flex",justifyContent:"space-between",alignItems:"center",
    padding:"13px 28px",
    background:"linear-gradient(180deg,rgba(249,250,251,0.8) 0%,rgba(255,255,255,0.5) 100%)",
    borderBottom:"1px solid rgba(229,231,235,0.7)",
    gap:12,flexWrap:"wrap",
  },
  updateBox:    { display:"flex",alignItems:"center",gap:4,fontSize:13,color:"#374151" },
  updateLabel:  { color:"#6b7280" },
  updateVal:    { fontWeight:600,color:"#0c1a2e" },
  refreshPill: {
    marginLeft:8,fontSize:11,fontWeight:600,
    color:"#233971",background:"rgba(35,57,113,0.08)",
    padding:"2px 8px",borderRadius:99,
    animation:"pulse 1.5s ease-in-out infinite",
  },
  legend:      { display:"flex",alignItems:"center",gap:7,flexWrap:"wrap" },
  legendLabel: { fontSize:12,color:"#6b7280",fontWeight:600,marginRight:2 },
  legendChip:  { fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:99 },

  loadingWrap: {
    position:"relative",zIndex:1,
    display:"flex",flexDirection:"column",alignItems:"center",
    justifyContent:"center",padding:"72px 24px",gap:14,
  },
  spinOuter: {
    position:"absolute",width:52,height:52,
    border:"4px solid rgba(35,57,113,0.08)",borderTop:"4px solid #233971",
    borderRadius:"50%",animation:"spin 1s linear infinite",
  },
  spinInner: {
    position:"absolute",top:8,left:8,width:36,height:36,
    border:"3px solid rgba(35,57,113,0.06)",borderBottom:"3px solid #3d5ca8",
    borderRadius:"50%",animation:"spin 1.5s linear infinite reverse",
  },
  loadingTxt: { margin:"60px 0 0",color:"#6b7280",fontSize:14,fontWeight:500 },

  errorBox: {
    position:"relative",zIndex:1,
    display:"flex",alignItems:"flex-start",gap:14,
    margin:28,padding:"18px 22px",
    background:"linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)",
    border:"1px solid #fecaca",borderRadius:14,
  },
  errorTitle: { fontSize:14,fontWeight:700,color:"#991b1b",marginBottom:4 },
  errorText:  { fontSize:13,color:"#dc2626",lineHeight:"1.6" },

  emptyWrap: { textAlign:"center",padding:"60px 24px",position:"relative",zIndex:1 },
  emptyTxt:    { margin:"12px 0 4px",color:"#6b7280",fontSize:15,fontWeight:600 },
  emptySubTxt: { margin:0,color:"#9ca3af",fontSize:13 },

  /* ── Mobile cards ── */
  cardList: {
    position:"relative",zIndex:1,
    display:"flex",flexDirection:"column",gap:10,
    padding:"12px 12px 16px",
    background:"rgba(35,57,113,0.025)",
  },

  mobileSep: {
    display:"flex",alignItems:"center",
    padding:"6px 12px",gap:8,
    background:"linear-gradient(90deg,rgba(35,57,113,0.07) 0%,transparent 100%)",
    borderRadius:8,
  },
  mobileSepLabel: {
    fontSize:12,fontWeight:700,color:"#233971",letterSpacing:"0.3px",whiteSpace:"nowrap",
  },
  mobileSepLine: {
    flex:1,height:1,
    background:"linear-gradient(90deg,rgba(35,57,113,0.25) 0%,transparent 100%)",
  },

  mobileCard: {
    background:"#fff",
    border:"1px solid rgba(35,57,113,0.11)",
    borderRadius:14,
    padding:"14px 16px",
    boxShadow:"0 2px 8px rgba(35,57,113,0.07)",
    transition:"box-shadow 0.15s",
  },
  mobileCardDl: { background:"rgba(35,57,113,0.018)" },
  mobileCardUl: { background:"rgba(35,57,113,0.010)" },

  mobileCardTop: {
    display:"flex",alignItems:"center",
    justifyContent:"space-between",
    marginBottom:8,gap:8,
  },
  mobileCardTopLeft: {
    display:"flex",alignItems:"center",
    gap:7,minWidth:0,flex:1,
    flexWrap:"wrap",
  },
  mobileCardNum: {
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    minWidth:24,height:24,borderRadius:6,
    background:"rgba(35,57,113,0.09)",
    fontSize:11,fontWeight:700,color:"#233971",flexShrink:0,
  },

  mobileUsageRow: {
    display:"flex",alignItems:"center",gap:8,
    marginBottom:10,
  },

  mobileCardFields: {
    display:"flex",flexDirection:"column",gap:8,
  },
  mobileField: {
    display:"flex",alignItems:"center",
    justifyContent:"space-between",gap:8,
  },
  mobileFieldRow: {
    display:"flex",gap:10,
  },
  mobileFieldHalf: {
    flex:1,display:"flex",flexDirection:"column",gap:4,minWidth:0,
  },
  mobileFieldLabel: {
    fontSize:10,fontWeight:700,color:"#9ca3af",
    textTransform:"uppercase",letterSpacing:"0.5px",
  },

  /* ── Desktop table ── */
  tableWrap: { position:"relative",zIndex:1,overflowX:"auto" },
  table:     { width:"100%",borderCollapse:"collapse" },

  th: {
    padding:"13px 14px",
    background:"linear-gradient(180deg,rgba(35,57,113,0.07) 0%,rgba(249,250,251,0.85) 100%)",
    fontSize:11,fontWeight:700,color:"#1e3a5f",
    textTransform:"uppercase",letterSpacing:"0.7px",
    borderBottom:"2px solid rgba(35,57,113,0.14)",
    whiteSpace:"nowrap",textAlign:"left",
  },

  sepCell: {
    padding:0,
    background:"linear-gradient(90deg,rgba(35,57,113,0.06) 0%,rgba(255,255,255,0.15) 100%)",
    borderTop:"2px solid rgba(35,57,113,0.14)",
    borderBottom:"none",
  },
  sepInner: { display:"flex",alignItems:"center",padding:"7px 14px",gap:8 },
  sepLabel: { fontSize:12,fontWeight:700,color:"#233971",letterSpacing:"0.3px",whiteSpace:"nowrap" },
  sepLine:  { flex:1,height:1,background:"linear-gradient(90deg,rgba(35,57,113,0.3) 0%,transparent 100%)" },

  tr:   { transition:"background 0.15s" },
  trDl: { background:"rgba(35,57,113,0.018)" },
  trUl: { background:"rgba(35,57,113,0.010)" },

  td: {
    padding:"12px 14px",
    fontSize:13,color:"#374151",
    borderBottom:"1px solid rgba(243,244,246,0.95)",
    whiteSpace:"nowrap",verticalAlign:"middle",
  },

  numCell: {
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    minWidth:26,height:26,borderRadius:7,
    background:"rgba(35,57,113,0.08)",
    fontSize:12,fontWeight:700,color:"#233971",
  },
  routerCell: { display:"flex",alignItems:"center",gap:8 },
  routerDot: {
    width:7,height:7,borderRadius:"50%",
    background:"#00c875",boxShadow:"0 0 0 2px rgba(0,200,117,0.20)",flexShrink:0,
  },

  dlPill: {
    display:"inline-flex",alignItems:"center",
    fontSize:10,fontWeight:700,
    background:"rgba(35,57,113,0.10)",color:"#233971",
    border:"1px solid rgba(35,57,113,0.20)",
    padding:"3px 7px",borderRadius:99,whiteSpace:"nowrap",flexShrink:0,
  },
  ulPill: {
    display:"inline-flex",alignItems:"center",
    fontSize:10,fontWeight:700,
    background:"rgba(35,57,113,0.06)",color:"#3d5ca8",
    border:"1px solid rgba(35,57,113,0.15)",
    padding:"3px 7px",borderRadius:99,whiteSpace:"nowrap",flexShrink:0,
  },

  nameBadge: {
    display:"inline-block",
    background:"linear-gradient(135deg,rgba(35,57,113,0.08) 0%,rgba(35,57,113,0.13) 100%)",
    color:"#1e3a5f",padding:"4px 10px",borderRadius:8,
    fontSize:12,fontWeight:600,
    border:"1px solid rgba(35,57,113,0.18)",
  },
  prioBadge: {
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:26,height:26,borderRadius:7,
    background:"rgba(35,57,113,0.07)",fontSize:12,fontWeight:700,color:"#233971",
  },
  rateBadge: {
    display:"inline-block",padding:"4px 10px",
    borderRadius:8,fontSize:12,fontWeight:700,
  },
  bytesBadge: {
    display:"inline-block",
    background:"#f8fafc",color:"#334155",
    border:"1px solid #e2e8f0",
    padding:"3px 9px",borderRadius:8,
    fontSize:12,fontWeight:600,fontFamily:"monospace",
  },

  /* ── Scroll to top ── */
  scrollTopBtn: {
    position:"fixed",
    bottom:24,right:20,
    width:46,height:46,
    borderRadius:"50%",
    background:"linear-gradient(135deg,#233971 0%,#1a2d5a 100%)",
    border:"none",
    display:"flex",alignItems:"center",justifyContent:"center",
    cursor:"pointer",
    boxShadow:"0 4px 16px rgba(35,57,113,0.40)",
    zIndex:9999,
    transition:"transform 0.2s, box-shadow 0.2s",
  },
};

const sheet = document.createElement("style");
sheet.textContent = `
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.65;transform:scale(1.12);} }

  [data-live-bw-page="true"] table tbody tr:hover td {
    background-color: rgba(35,57,113,0.025) !important;
  }
  [data-live-bw-page="true"] select:focus,
  [data-live-bw-page="true"] input:focus {
    border-color: #233971 !important;
    box-shadow: 0 0 0 3px rgba(35,57,113,0.12) !important;
    outline: none;
  }
  button[title="Kembali ke atas"]:hover {
    transform: translateY(-3px) !important;
    box-shadow: 0 8px 24px rgba(35,57,113,0.50) !important;
  }

  @media (max-width: 640px) {
    [data-live-bw-page="true"] { padding: 0 !important; }
    [data-live-bw-page="true"] > div:first-child {
      border-radius: 18px !important;
      margin: 0 4px !important;
    }
    [data-live-bw-page="true"] [data-section="header"] {
      padding: 18px 16px !important;
    }
    [data-live-bw-page="true"] [data-section="infobar"] {
      padding: 10px 16px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 8px !important;
    }
    [data-live-bw-page="true"] [data-section="infobar"] > div:last-child {
      flex-wrap: wrap !important;
    }
    button[title="Kembali ke atas"] {
      bottom: 90px !important;
    }
  }
`;
document.head.appendChild(sheet);
