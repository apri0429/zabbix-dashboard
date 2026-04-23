import { useEffect, useMemo, useState } from "react";
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
      try {
        rawText = await res.text();
      } catch {}
      let parsed = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(
          parsed?.detail ||
            parsed?.message ||
            parsed?.error ||
            rawText ||
            "Gagal mengambil data"
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
    return Number.isNaN(n) ? String(v) : `${(n / 1_000_000).toFixed(2)} Mbps`;
  };

  const toBytes = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
    if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
    if (n >= 1_024) return `${(n / 1_024).toFixed(2)} KB`;
    return `${n} B`;
  };

  const usagePct = (rate, maxLimit) => {
    const r = Number(rate) || 0;
    const m = Number(maxLimit) || 0;
    if (!m) return 0;
    return Math.min((r / m) * 100, 100);
  };

  const usageColor = (pct) => {
    if (pct >= 85) {
      return {
        text: "#b91c1c",
        bg: "#fee2e2",
        border: "#fecaca",
        bar: "#ef4444",
      };
    }
    if (pct >= 60) {
      return {
        text: "#b45309",
        bg: "#fef3c7",
        border: "#fde68a",
        bar: "#f59e0b",
      };
    }
    return {
      text: "#065f46",
      bg: "#d1fae5",
      border: "#6ee7b7",
      bar: "#10b981",
    };
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

  const isDownloadQueue = (name = "") => {
    const lower = name.toLowerCase();
    return DL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
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
      const group = groups[key];
      result.push({ type: "sep", key });
      if (group.download) {
        result.push({
          type: "row",
          item: group.download,
          label: "Download",
          accent: "dl",
        });
      }
      if (group.upload) {
        result.push({
          type: "row",
          item: group.upload,
          label: "Upload",
          accent: "ul",
        });
      }
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
          <div style={S.header} data-section="header">
            <div style={S.headerGlow} />
            <div style={S.headerWave} />
            <div style={S.headerContent}>
              <div style={S.headerLeft}>
                <div style={S.iconWrap}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 3.5v9"
                      stroke="rgba(255,255,255,0.95)"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6.5 9.5L10 13l3.5-3.5"
                      stroke="rgba(255,255,255,0.95)"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect
                      x="3"
                      y="14.5"
                      width="14"
                      height="2"
                      rx="1"
                      fill="rgba(255,255,255,0.80)"
                    />
                  </svg>
                </div>
                <div>
                  <h2 style={S.title}>Live Bandwidth</h2>
                  <p style={S.subtitle}>Monitoring queue tree per router · monitoring realtime</p>
                </div>
              </div>
              <div style={S.countBadge}>
                <span style={S.countDot} />
                <span style={{ fontWeight: 800, fontSize: 15 }}>{data.length}</span>
                <span style={{ fontWeight: 500, opacity: 0.75, fontSize: 12 }}>queue</span>
              </div>
            </div>
          </div>

          <div style={S.infoBar} data-section="infobar">
            <div style={S.infoLeft}>
              <span
                style={{
                  ...S.statusDotSm,
                  background: refreshing ? "#f59e0b" : "#10b981",
                  boxShadow: `0 0 0 3px ${
                    refreshing ? "rgba(245,158,11,0.18)" : "rgba(16,185,129,0.18)"
                  }`,
                }}
              />
              <span style={S.infoText}>
                {refreshing ? "Memperbarui..." : `Update: ${lastUpdate || "—"}`}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={S.legend}>
                <span style={S.legendLabel}>Indikator:</span>
                {[
                  { label: "< 60%", bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
                  { label: "60-84%", bg: "#fef3c7", color: "#b45309", border: "#fde68a" },
                  { label: ">= 85%", bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
                ].map((item) => (
                  <span
                    key={item.label}
                    style={{
                      ...S.legendChip,
                      background: item.bg,
                      color: item.color,
                      border: `1px solid ${item.border}`,
                    }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              <div style={S.selectWrap}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={S.selectIcon}>
                  <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#64748b" strokeWidth="1.3" />
                  <circle cx="4" cy="7" r="0.9" fill="#64748b" />
                  <circle cx="7" cy="7" r="0.9" fill="#64748b" />
                  <circle cx="10" cy="7" r="0.9" fill="#64748b" />
                </svg>
                <select
                  value={routerId}
                  onChange={(e) => setRouterId(e.target.value)}
                  style={S.select}
                >
                  {routerOptions.map((router) => (
                    <option key={router.value} value={router.value}>
                      {router.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={S.loadingWrap}>
              <div style={S.spinRing} />
              <p style={S.loadingTxt}>Memuat data bandwidth...</p>
            </div>
          ) : error ? (
            <div style={S.errorBox}>
              <div style={S.errorIconWrap}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#dc2626" strokeWidth="1.5" />
                  <path d="M10 6v4M10 14h.01" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={S.errorTitle}>Gagal memuat data</div>
                <div style={S.errorText}>{error}</div>
              </div>
            </div>
          ) : groupedRows.length === 0 ? (
            <div style={S.emptyWrap}>
              <div style={S.emptyIconBox}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="12" stroke="rgba(35,57,113,0.15)" strokeWidth="1.5" />
                  <path d="M9 19l10-10M19 19L9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p style={S.emptyTxt}>Tidak ada data live bandwidth</p>
              <p style={S.emptySubTxt}>Coba pilih router yang berbeda</p>
            </div>
          ) : isMobile ? (
            <div style={S.cardList}>
              {(() => {
                let rowNum = 0;
                return groupedRows.map((row, index) => {
                  if (row.type === "sep") {
                    return (
                      <div key={`sep-${row.key}-${index}`} style={S.mobileSep}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="1" y="1" width="10" height="10" rx="2" stroke="#233971" strokeWidth="1.2" />
                          <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke="#233971" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                        <span style={S.mobileSepLabel}>{row.key}</span>
                        <div style={S.mobileSepLine} />
                      </div>
                    );
                  }

                  rowNum += 1;
                  const { item, label, accent } = row;
                  const isDl = accent === "dl";
                  const isUl = accent === "ul";
                  const pct = usagePct(item.rate, item["max-limit"]);
                  const col = usageColor(pct);

                  return (
                    <div
                      key={item[".id"] || `${item.name}-${index}`}
                      style={{
                        ...S.mobileCard,
                        ...(isDl ? S.mobileCardDl : isUl ? S.mobileCardUl : {}),
                      }}
                    >
                      <div style={S.mcHead}>
                        <div style={S.mcHeadLeft}>
                          <span style={S.rowNum}>{rowNum}</span>
                          <span style={S.routerDot} />
                          <span style={S.routerName}>{item.router_name || "—"}</span>
                        </div>
                        {label ? (
                          <span style={isDl ? S.dlPill : S.ulPill}>{label}</span>
                        ) : (
                          <span style={S.statusBadge}>Queue</span>
                        )}
                      </div>

                      <div style={S.mcBody}>
                        <div style={S.dataRow}>
                          <span style={S.dataLabel}>Queue</span>
                          <span style={S.nameBadge}>{item.name || "—"}</span>
                        </div>
                        <div style={S.dataRow}>
                          <span style={S.dataLabel}>Rate</span>
                          <span
                            style={{
                              ...S.rateBadge,
                              background: col.bg,
                              color: col.text,
                              border: `1px solid ${col.border}`,
                            }}
                          >
                            {toMbps(item.rate)}
                          </span>
                        </div>
                        <div style={S.mobileUsageRow}>
                          <span style={{ fontSize: 11, color: col.text, fontWeight: 700, minWidth: 38 }}>
                            {pct.toFixed(1)}%
                          </span>
                          <div style={S.usageTrack}>
                            <div
                              style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: col.bar,
                                borderRadius: 99,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div style={S.mcFoot}>
                        <span style={S.serverBadge}>{toMbps(item["limit-at"])}</span>
                        <span style={S.serverBadge}>{toMbps(item["max-limit"])}</span>
                        <span style={S.bytesBadge}>{toBytes(item.bytes)}</span>
                        <span style={S.prioBadge}>{item.priority || "-"}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["#", "Router", "Queue Name", "Priority", "Limit At", "Max Limit", "Rate", "Usage", "Bytes"].map(
                      (header) => (
                        <th key={header} style={S.th}>
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let rowNum = 0;
                    return groupedRows.map((row, index) => {
                      if (row.type === "sep") {
                        return (
                          <tr key={`sep-${row.key}-${index}`}>
                            <td colSpan={9} style={S.sepCell}>
                              <div style={S.sepInner}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="#233971" strokeWidth="1.2" />
                                  <path d="M3.5 6h5M3.5 4h5M3.5 8h3" stroke="#233971" strokeWidth="1" strokeLinecap="round" />
                                </svg>
                                <span style={S.sepLabel}>{row.key}</span>
                                <div style={S.sepLine} />
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      rowNum += 1;
                      const { item, label, accent } = row;
                      const isDl = accent === "dl";
                      const isUl = accent === "ul";
                      const pct = usagePct(item.rate, item["max-limit"]);
                      const col = usageColor(pct);

                      return (
                        <tr
                          key={item[".id"] || `${item.name}-${index}`}
                          style={{
                            ...S.tr,
                            background:
                              index % 2 === 0 ? "#fff" : "rgba(248,250,252,0.8)",
                            ...(isDl ? S.trDl : isUl ? S.trUl : {}),
                          }}
                        >
                          <td style={S.td}>
                            <span style={S.numCell}>{rowNum}</span>
                          </td>
                          <td style={S.td}>
                            <div style={S.routerCell}>
                              <span style={S.routerDotTd} />
                              <span style={{ fontSize: 13, color: "#1e3a5f", fontWeight: 600 }}>
                                {item.router_name || "—"}
                              </span>
                            </div>
                          </td>
                          <td style={S.td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {label && <span style={isDl ? S.dlPill : S.ulPill}>{label}</span>}
                              <span style={S.nameBadge}>{item.name || "—"}</span>
                            </div>
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>
                            <span style={S.prioBadge}>{item.priority || "-"}</span>
                          </td>
                          <td style={S.td}>
                            <span style={S.serverBadgeTd}>{toMbps(item["limit-at"])}</span>
                          </td>
                          <td style={S.td}>
                            <span style={S.serverBadgeTd}>{toMbps(item["max-limit"])}</span>
                          </td>
                          <td style={S.td}>
                            <span
                              style={{
                                ...S.rateBadge,
                                background: col.bg,
                                color: col.text,
                                border: `1px solid ${col.border}`,
                              }}
                            >
                              {toMbps(item.rate)}
                            </span>
                          </td>
                          <td style={S.td}>
                            <UsageBar pct={pct} col={col} />
                          </td>
                          <td style={S.td}>
                            <span style={S.bytesBadge}>{toBytes(item.bytes)}</span>
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

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={S.scrollTopBtn}
          title="Kembali ke atas"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 15V5M5 10l5-5 5 5"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  );
}

function UsageBar({ pct, col }) {
  return (
    <div style={{ minWidth: 96 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: col.text,
          display: "block",
          marginBottom: 4,
        }}
      >
        {pct.toFixed(1)}%
      </span>
      <div style={S.usageTrack}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: col.bar,
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
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

  header: {
    position: "relative",
    zIndex: 1,
    background: "linear-gradient(135deg, #2c4584 0%, #1c2e5a 55%, #0f1e40 100%)",
    padding: "22px 28px",
    overflow: "hidden",
  },

  headerGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 200,
    height: 200,
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

  legend: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },

  legendLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 600,
    marginRight: 2,
  },

  legendChip: {
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 99,
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

  cardList: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 12px 16px",
    background: "#f1f5f9",
  },

  mobileSep: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    gap: 8,
    background: "linear-gradient(90deg, rgba(35,57,113,0.07) 0%, transparent 100%)",
    borderRadius: 8,
  },

  mobileSepLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#233971",
    letterSpacing: "0.3px",
    whiteSpace: "nowrap",
  },

  mobileSepLine: {
    flex: 1,
    height: 1,
    background: "linear-gradient(90deg, rgba(35,57,113,0.25) 0%, transparent 100%)",
  },

  mobileCard: {
    background: "#fff",
    border: "1px solid rgba(35,57,113,0.08)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(35,57,113,0.06), 0 4px 10px rgba(35,57,113,0.04)",
  },

  mobileCardDl: {
    background: "#fff",
  },

  mobileCardUl: {
    background: "#fff",
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
    background: "rgba(35,57,113,0.07)",
    color: "#233971",
    border: "1px solid rgba(35,57,113,0.13)",
    borderRadius: 99,
    fontSize: 11.5,
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },

  mcBody: {
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
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
    minWidth: 42,
  },

  mobileUsageRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  usageTrack: {
    flex: 1,
    height: 5,
    borderRadius: 99,
    background: "#f1f5f9",
    overflow: "hidden",
  },

  mcFoot: {
    padding: "9px 14px",
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },

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

  tableWrap: {
    position: "relative",
    zIndex: 1,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 860,
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

  sepCell: {
    padding: 0,
    background: "linear-gradient(90deg, rgba(35,57,113,0.06) 0%, rgba(255,255,255,0.15) 100%)",
    borderTop: "1px solid rgba(226,232,240,0.8)",
  },

  sepInner: {
    display: "flex",
    alignItems: "center",
    padding: "7px 14px",
    gap: 8,
  },

  sepLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#233971",
    letterSpacing: "0.3px",
    whiteSpace: "nowrap",
  },

  sepLine: {
    flex: 1,
    height: 1,
    background: "linear-gradient(90deg, rgba(35,57,113,0.3) 0%, transparent 100%)",
  },

  tr: {
    transition: "background 0.12s",
  },

  trDl: {
    background: "rgba(35,57,113,0.015)",
  },

  trUl: {
    background: "rgba(35,57,113,0.01)",
  },

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

  dlPill: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 700,
    background: "rgba(35,57,113,0.10)",
    color: "#233971",
    border: "1px solid rgba(35,57,113,0.20)",
    padding: "3px 7px",
    borderRadius: 99,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  ulPill: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 700,
    background: "rgba(35,57,113,0.06)",
    color: "#3d5ca8",
    border: "1px solid rgba(35,57,113,0.15)",
    padding: "3px 7px",
    borderRadius: 99,
    whiteSpace: "nowrap",
    flexShrink: 0,
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
    maxWidth: 240,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  prioBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "rgba(35,57,113,0.07)",
    fontSize: 12,
    fontWeight: 700,
    color: "#233971",
  },

  rateBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
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

  bytesBadge: {
    display: "inline-block",
    background: "#f8fafc",
    color: "#334155",
    border: "1px solid #e2e8f0",
    padding: "3px 9px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "monospace",
  },

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

  [data-live-bw-page="true"] table tbody tr:hover td {
    background-color: rgba(35,57,113,0.03) !important;
  }
  [data-live-bw-page="true"] select:focus,
  [data-live-bw-page="true"] input:focus {
    border-color: #233971 !important;
    box-shadow: 0 0 0 3px rgba(35,57,113,0.10) !important;
    background: #fff !important;
    outline: none;
  }
  button[title="Kembali ke atas"]:hover {
    transform: translateY(-3px) scale(1.04) !important;
    box-shadow: 0 8px 24px rgba(35,57,113,0.48) !important;
  }

  @media (max-width: 640px) {
    [data-live-bw-page="true"] { padding: 0 !important; }

    [data-live-bw-page="true"] > div:first-child {
      border-radius: 16px !important;
      margin: 0 4px !important;
    }

    [data-live-bw-page="true"] [data-section="header"] {
      padding: 18px 16px !important;
    }

    [data-live-bw-page="true"] [data-section="infobar"] {
      padding: 9px 16px !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 8px !important;
    }

    button[title="Kembali ke atas"] {
      bottom: calc(74px + 44px + env(safe-area-inset-bottom, 0px)) !important;
      right: 16px !important;
    }
  }
`;
document.head.appendChild(sheet);
