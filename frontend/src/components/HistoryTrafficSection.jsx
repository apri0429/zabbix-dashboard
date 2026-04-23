import { useMemo, useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const C = {
  surface:       "#ffffff",
  bg:            "#f0f4f9",
  accent:        "#233971",
  accentLight:   "#3d5ca8",
  green:         "#00c875",
  greenBg:       "rgba(0,200,117,0.08)",
  greenBorder:   "rgba(0,200,117,0.22)",
  orange:        "#f59e0b",
  orangeBg:      "rgba(245,158,11,0.08)",
  orangeBorder:  "rgba(245,158,11,0.22)",
  border:        "rgba(35,57,113,0.09)",
  borderMid:     "rgba(35,57,113,0.16)",
  textPrimary:   "#0d1f3c",
  textSecondary: "#3d5278",
  textMuted:     "#7a90b0",
  textHint:      "#b0bdd0",
};

const HOST_COLORS = [
  "#233971", "#00c875", "#f59e0b", "#ef4444",
  "#6d28d9", "#0891b2", "#0f766e", "#b45309",
  "#3d5ca8", "#9333ea", "#15803d", "#dc2626",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const shortLabel = (s = "") =>
  s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();

const makeInitials = (s = "") => {
  const clean = shortLabel(s);
  const words = clean.split(/[\s\-\/\.]+/).filter(Boolean);
  if (words.length === 1) return clean.slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
};

const fmtTime = (v) => {
  if (!v) return "-";
  const d = dayjs(v);
  return d.isValid() ? d.format("HH:mm") : String(v);
};

const fmtTickDate = (v) => {
  if (!v) return { date: "-", time: "" };
  const d = dayjs(v);
  if (!d.isValid()) return { date: String(v), time: "" };
  return {
    date: d.format("DD MMM YYYY"),
    time: d.format("HH:mm"),
  };
};

const fmtDateTime = (v) => {
  if (!v) return "-";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD MMM HH:mm") : String(v);
};

const toMbps = (v) => `${Number(v || 0).toFixed(1)} Mbps`;

const buildTicks = (data = [], desired = 7) => {
  if (!data.length) return [];
  if (data.length <= desired) return data.map((d) => d.time);
  const step = Math.max(1, Math.ceil(data.length / desired));
  const ticks = data.filter((_, i) => i % step === 0).map((d) => d.time);
  const last = data[data.length - 1]?.time;
  if (last && ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
};

// ─── Tiny Atoms ──────────────────────────────────────────────────────────────
const Dot = ({ color, size = 6 }) => (
  <span style={{
    width: size, height: size, borderRadius: "50%",
    background: color, display: "inline-block", flexShrink: 0,
  }} />
);

const TimeAxisTick = ({ x, y, payload }) => {
  const { date, time } = fmtTickDate(payload?.value);
  return (
    <g transform={`translate(${x},${y + 10})`}>
      <text textAnchor="middle" fill={C.textHint}>
        <tspan x="0" dy="0" fontSize="9" fontWeight="700">
          {date}
        </tspan>
        <tspan x="0" dy="12" fontSize="9">
          {time}
        </tspan>
      </text>
    </g>
  );
};

// ─── Metric Card ─────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, color, bgColor, borderColor }) => (
  <div style={{
    flex: "1 1 calc(50% - 6px)",
    minWidth: 130,
    borderRadius: 16,
    padding: "14px 14px 12px",
    background: bgColor,
    border: `1px solid ${borderColor}`,
  }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
    }}>
      <Dot color={color} size={7} />
      <span style={{
        fontSize: 10, fontWeight: 700, color,
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>
        {label}
      </span>
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{
        fontSize: 26, fontWeight: 700, color: C.textPrimary,
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {Number(value || 0).toFixed(1)}
      </span>
      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Mbps</span>
    </div>
  </div>
);

// ─── Pill Toggle Button ───────────────────────────────────────────────────────
const PillBtn = ({ active, onClick, children, activeColor = C.accent }) => (
  <button
    onClick={onClick}
    style={{
      flexShrink: 0,
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "7px 13px",
      borderRadius: 99,
      border: `1px solid ${active ? activeColor + "55" : C.border}`,
      background: active ? activeColor + "12" : C.surface,
      color: active ? activeColor : C.textMuted,
      fontSize: 12, fontWeight: 700,
      cursor: "pointer",
      transition: "all 0.15s",
      WebkitTapHighlightColor: "transparent",
    }}
  >
    {children}
  </button>
);

// ─── Router Chip ─────────────────────────────────────────────────────────────
const RouterChip = ({ host, index, isActive, avgDl, onSelect }) => {
  const clean = shortLabel(host);
  const init = makeInitials(host);

  return (
    <button
      onClick={() => onSelect(host)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        width: "100%",
        minHeight: 130,
        padding: "16px 12px 14px",
        borderRadius: 16,
        border: `1.5px solid ${isActive ? "rgba(35,57,113,0.35)" : "rgba(35,57,113,0.12)"}`,
        background: isActive
          ? "linear-gradient(145deg, #233971 0%, #1c2e5a 60%, #0f1e40 100%)"
          : "linear-gradient(145deg, #f6f8fd 0%, #eef2fb 100%)",
        cursor: "pointer",
        transition: "all 0.20s ease",
        WebkitTapHighlightColor: "transparent",
        position: "relative",
        justifyContent: "flex-start",
        overflow: "hidden",
        boxShadow: isActive
          ? "0 4px 16px rgba(35,57,113,0.22)"
          : "0 1px 3px rgba(35,57,113,0.08)",
      }}
    >
      {/* Top accent bar (inactive) */}
      {!isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          borderRadius: "16px 16px 0 0",
          background: "linear-gradient(90deg, #233971 0%, #3d5ca8 100%)",
          opacity: 0.45,
          pointerEvents: "none",
        }} />
      )}
      {/* Background icon watermark (inactive) */}
      {!isActive && (
        <svg width="58" height="58" viewBox="0 0 24 24" fill="none"
          stroke={C.accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", bottom: -6, right: -6, opacity: 0.055, pointerEvents: "none" }}>
          <rect x="2" y="9" width="20" height="6" rx="2" />
          <path d="M6 12h.01M10 12h.01" />
          <path d="M7 4v5M17 4v5" />
          <path d="M7 15v5M17 15v5" />
        </svg>
      )}

      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: "50%",
        background: isActive ? "rgba(255,255,255,0.16)" : "rgba(35,57,113,0.10)",
        border: isActive ? "1.5px solid rgba(255,255,255,0.28)" : "1.5px solid rgba(35,57,113,0.20)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
        color: isActive ? "#ffffff" : C.accent,
        marginBottom: 10, marginTop: isActive ? 4 : 7,
        flexShrink: 0,
      }}>
        {init}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 10.5, fontWeight: 700,
        color: isActive ? "rgba(255,255,255,0.90)" : C.accent,
        textAlign: "center", lineHeight: 1.35,
        wordBreak: "break-word", maxWidth: "100%",
        minHeight: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {clean}
      </div>

      {/* Avg DL badge */}
      {avgDl !== null && (
        <div style={{
          marginTop: 8, padding: "3px 8px",
          borderRadius: 99,
          background: isActive ? "rgba(255,255,255,0.14)" : "rgba(35,57,113,0.08)",
          border: isActive ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(35,57,113,0.18)",
          fontSize: 9.5, fontWeight: 700,
          color: isActive ? "rgba(255,255,255,0.85)" : C.accent,
          whiteSpace: "nowrap",
        }}>
          ↓ {Number(avgDl).toFixed(1)} M
        </div>
      )}

      {/* Active green dot */}
      {isActive && (
        <div style={{
          position: "absolute", top: 10, right: 10,
          width: 7, height: 7, borderRadius: "50%",
          background: "#00c875",
          boxShadow: "0 0 0 3px rgba(0,200,117,0.22)",
        }} />
      )}
    </button>
  );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d1f3c",
      border: "1px solid #1a3560",
      borderRadius: 14,
      padding: "10px 13px",
      fontSize: 12,
      minWidth: 160,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700,
        color: "#7a90b0", marginBottom: 8,
        letterSpacing: "0.04em",
      }}>
        {fmtDateTime(label)}
      </div>
      {payload.map((p) =>
        p.name && !p.name.startsWith("__") ? (
          <div key={p.dataKey} style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", gap: 16, marginBottom: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Dot color={p.color} size={7} />
              <span style={{ color: "#c8d8ee", fontWeight: 600 }}>{p.name}</span>
            </div>
            <span style={{ color: "#fff", fontWeight: 700 }}>{toMbps(p.value)}</span>
          </div>
        ) : null
      )}
    </div>
  );
};

// ─── Chart Area Dot (peak only) ───────────────────────────────────────────────
const PeakDot = ({ cx, cy, value, color, threshold }) => {
  if (!value || value < threshold) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.15} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#fff" strokeWidth={2} />
    </g>
  );
};

// ─── Main Chart Component ─────────────────────────────────────────────────────
const TrafficChart = ({ rows = [], summaryRows = [], historyMeta = null }) => {
  const normalizedRows = useMemo(() => {
    const fallback = historyMeta?.selected_label || summaryRows?.[0]?.label || "Router";
    return (rows || []).map((r) => ({
      ...r,
      host: r.host || r.label || r.name || r.router || r.selected_label || fallback,
    }));
  }, [rows, summaryRows, historyMeta]);

  const grouped = useMemo(() => {
    const map = {};
    normalizedRows.forEach((r) => {
      const key = r.host || "Router";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    if (!Object.keys(map).length && summaryRows?.length) {
      summaryRows.forEach((s) => { if (!map[s.label]) map[s.label] = []; });
    }
    return map;
  }, [normalizedRows, summaryRows]);

  const hostList = useMemo(() => {
    const keys = Object.keys(grouped).filter(Boolean);
    if (keys.length > 1) return keys;
    if (keys.length === 1 && grouped[keys[0]]?.length) return keys;
    return (summaryRows || []).map((s) => s.label);
  }, [grouped, summaryRows]);

  const [selectedHost, setSelectedHost] = useState(null);
  const [chartMode, setChartMode]       = useState("smooth");
  const [showDl, setShowDl]             = useState(true);
  const [showUl, setShowUl]             = useState(true);
  const isDesktop = typeof window !== "undefined" ? window.innerWidth >= 1024 : true;

  useEffect(() => {
    if (!hostList.length) { setSelectedHost(null); return; }
    if (!selectedHost || !hostList.includes(selectedHost)) {
      setSelectedHost(
        historyMeta?.selected_label && hostList.includes(historyMeta.selected_label)
          ? historyMeta.selected_label
          : hostList[0]
      );
    }
  }, [hostList, selectedHost, historyMeta]);

  const activeKey = (selectedHost && hostList.includes(selectedHost))
    ? selectedHost : hostList[0];

  const activeRows = useMemo(() => {
    if (!activeKey) return [];
    if (grouped[activeKey]?.length) return grouped[activeKey];
    if (historyMeta?.selected_label === activeKey && normalizedRows.length) return normalizedRows;
    return [];
  }, [activeKey, grouped, historyMeta, normalizedRows]);

  const chartData = useMemo(() =>
    activeRows.map((r, i) => ({
      idx: i,
      time: r.time || r.timestamp || r.clock || r.datetime || r.date || r.label || `P-${i + 1}`,
      download: +r.download || +r.rx || +r.inbound || +r.in || +r.avg_download || +r.value_download || 0,
      upload:   +r.upload   || +r.tx || +r.outbound || +r.out || +r.avg_upload  || +r.value_upload  || 0,
    })),
    [activeRows]
  );

  const ticks = useMemo(() => buildTicks(chartData, 7), [chartData]);

  if (!hostList.length && !rows.length) {
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 8, flexWrap: "wrap",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: "rgba(35,57,113,0.08)",
              border: "1px solid rgba(35,57,113,0.14)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
                History Traffic
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                Monitoring bandwidth real-time
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, padding: "4px 10px",
            borderRadius: 99, background: C.accent + "12",
            color: C.accent, border: `1px solid ${C.accent}28`,
          }}>
            0 titik data
          </div>
        </div>

        <div style={{
          height: 220, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 14, borderRadius: 16,
          background: "rgba(35,57,113,0.03)",
          border: "1px dashed rgba(35,57,113,0.15)",
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: "rgba(35,57,113,0.08)",
            border: "1px solid rgba(35,57,113,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke={C.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.65 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
              Belum ada data history traffic
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5, maxWidth: 240 }}>
              Pilih rentang tanggal dan klik Generate untuk memuat data.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const peakDl = Math.max(...chartData.map((d) => d.download), 0);
  const peakUl = Math.max(...chartData.map((d) => d.upload), 0);
  const avgDl  = chartData.length ? chartData.reduce((s, d) => s + d.download, 0) / chartData.length : 0;
  const avgUl  = chartData.length ? chartData.reduce((s, d) => s + d.upload,   0) / chartData.length : 0;

  const maxVal = Math.max(
    ...chartData.map((d) => Math.max(showDl ? d.download : 0, showUl ? d.upload : 0)), 0
  );
  const yMax          = maxVal <= 10 ? 10 : Math.ceil(maxVal / 10) * 10;
  const peakThreshold = maxVal * 0.88;
  const activeColor   = C.accent;

  const commonAxis = {
    xAxis: (
      <XAxis
        dataKey="time"
        ticks={ticks}
        tick={<TimeAxisTick />}
        axisLine={false} tickLine={false} minTickGap={32}
        height={72}
        dy={12}
      />
    ),
    yAxis: (
      <YAxis
        domain={[0, yMax]}
        tick={{ fill: C.textHint, fontSize: 10 }}
        axisLine={false} tickLine={false} width={58}
        tickFormatter={(v) => v === 0 ? "0" : `${v}M`}
      />
    ),
    grid: (
      <CartesianGrid strokeDasharray="2 5" stroke="rgba(15,30,60,0.06)" vertical={false} />
    ),
    tooltip: (
      <Tooltip
        content={<ChartTooltip />}
        cursor={{ stroke: C.borderMid, strokeWidth: 1, strokeDasharray: "3 3" }}
      />
    ),
    legend: (
      <Legend
        wrapperStyle={{ paddingTop: 14, fontSize: 11 }}
        formatter={(val) => {
          if (!val || val.startsWith("__")) return null;
          return (
            <span style={{ fontWeight: 700, color: val === "Download" ? C.green : C.orange }}>
              {val}
            </span>
          );
        }}
      />
    ),
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 8, flexWrap: "wrap",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "rgba(35,57,113,0.08)",
            border: "1px solid rgba(35,57,113,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
              History Traffic
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Monitoring bandwidth real-time
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, padding: "4px 10px",
          borderRadius: 99, background: C.accent + "12",
          color: C.accent, border: `1px solid ${C.accent}28`,
        }}>
          {chartData.length} titik data
        </div>
      </div>

      {/* ── Router Selector ────────────────────────────────────── */}
      {hostList.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.accent,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              Pilih Router
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px",
              borderRadius: 99, background: C.accent + "12",
              color: C.accent, border: `1px solid ${C.accent}28`,
            }}>
              {hostList.length} device
            </div>
          </div>
          <div style={{
            display: "flex",
            gap: 10,
            flexWrap: isDesktop ? "wrap" : "nowrap",
            overflowX: isDesktop ? "visible" : "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            paddingBottom: isDesktop ? 0 : 4,
          }}>
            {hostList.map((host, i) => {
              const r = grouped[host] || [];
              const vals = r.map((x) => +x.download || +x.rx || +x.avg_download || 0);
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              return (
                <div key={host} style={{
                  flex: isDesktop ? "1 1 128px" : "0 0 112px",
                  minWidth: 0,
                }}>
                  <RouterChip
                    host={host}
                    index={i}
                    isActive={host === activeKey}
                    avgDl={avg}
                    onSelect={setSelectedHost}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: "linear-gradient(90deg, rgba(35,57,113,0.18) 0%, rgba(35,57,113,0.06) 100%)",
        marginBottom: 14,
        borderRadius: 99,
      }} />

      {/* ── Active Router Info Bar ─────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderRadius: 14, marginBottom: 14,
        background: "rgba(35,57,113,0.06)",
        border: "1px solid rgba(35,57,113,0.18)",
        flexWrap: "wrap",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: activeColor, flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: activeColor }}>
          {shortLabel(activeKey || "-")}
        </span>
        {chartData.length > 0 && (
          <span style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>
            {fmtDateTime(chartData[0]?.time)}
            {" → "}
            {fmtDateTime(chartData[chartData.length - 1]?.time)}
          </span>
        )}
      </div>

      {/* ── Metric Cards ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label="Peak DL"  value={peakDl} color={C.green}  bgColor={C.greenBg}  borderColor={C.greenBorder}  />
        <MetricCard label="Peak UL"  value={peakUl} color={C.orange} bgColor={C.orangeBg} borderColor={C.orangeBorder} />
        <MetricCard label="Avg DL"   value={avgDl}  color={C.green}  bgColor={C.greenBg}  borderColor={C.greenBorder}  />
        <MetricCard label="Avg UL"   value={avgUl}  color={C.orange} bgColor={C.orangeBg} borderColor={C.orangeBorder} />
      </div>

      {/* ── Toggle Controls ────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14,
      }}>
        <PillBtn active={chartMode === "smooth"} onClick={() => setChartMode("smooth")}>
          ≋ Smooth
        </PillBtn>
        <PillBtn active={chartMode === "detail"} onClick={() => setChartMode("detail")}>
          ⌇ Detail
        </PillBtn>
        <PillBtn active={showDl} onClick={() => setShowDl((v) => !v)} activeColor={C.green}>
          <Dot color={C.green} size={7} /> Download
        </PillBtn>
        <PillBtn active={showUl} onClick={() => setShowUl((v) => !v)} activeColor={C.orange}>
          <Dot color={C.orange} size={7} /> Upload
        </PillBtn>
      </div>

      {/* ── Chart ──────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        background: "#fafcff",
        padding: "16px 8px 10px",
        overflow: "hidden",
        position: "relative",
      }}>
        {chartMode === "smooth" ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 6 }}>
              <defs>
                {/* ── Fill utama Download (tipis, natural) ── */}
                <linearGradient id="gradDl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.green} stopOpacity={0.30} />
                  <stop offset="70%"  stopColor={C.green} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.00} />
                </linearGradient>

                {/* ── Fill utama Upload (tipis, natural) ── */}
                <linearGradient id="gradUl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.orange} stopOpacity={0.22} />
                  <stop offset="70%"  stopColor={C.orange} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={C.orange} stopOpacity={0.00} />
                </linearGradient>

                {/*
                  ── GLOW FILL Download ──
                  Solid penuh dari atas ke bawah, makin bawah makin fade.
                  Mirip seperti referensi gambar: area terisi dari garis ke sumbu X.
                  Di-blur via SVG filter supaya tepinya soft/mblur.
                */}
                <linearGradient id="gradDlGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.green} stopOpacity={0.75} />
                  <stop offset="35%"  stopColor={C.green} stopOpacity={0.50} />
                  <stop offset="70%"  stopColor={C.green} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.05} />
                </linearGradient>

                {/* ── GLOW FILL Upload ── */}
                <linearGradient id="gradUlGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.orange} stopOpacity={0.70} />
                  <stop offset="35%"  stopColor={C.orange} stopOpacity={0.45} />
                  <stop offset="70%"  stopColor={C.orange} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={C.orange} stopOpacity={0.05} />
                </linearGradient>

                {/* SVG filter blur — dipakai oleh layer glow shadow */}
                <filter id="blurGreen" x="-8%" y="-8%" width="116%" height="140%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
                <filter id="blurOrange" x="-8%" y="-8%" width="116%" height="140%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>

              {commonAxis.grid}
              {commonAxis.xAxis}
              {commonAxis.yAxis}
              {commonAxis.tooltip}
              {commonAxis.legend}

              {/*
                ─────────────────────────────────────────────
                LAYER 1 — GLOW SHADOW (di belakang)
                Render duluan supaya layer utama menimpa di atasnya.
                - fill tebal + blur → efek area berpendar ke bawah
                - legendType="none" → tidak muncul di legend
                - stroke="none" → tidak ada garis tepi
                - isAnimationActive={false} → tidak animasi sendiri
                ─────────────────────────────────────────────
              */}
              {showDl && (
                <Area
                  type="monotoneX"
                  dataKey="download"
                  name="__glowDl__"
                  stroke="none"
                  strokeWidth={0}
                  fill="url(#gradDlGlow)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                  style={{ filter: "url(#blurGreen)" }}
                />
              )}
              {showUl && (
                <Area
                  type="monotoneX"
                  dataKey="upload"
                  name="__glowUl__"
                  stroke="none"
                  strokeWidth={0}
                  fill="url(#gradUlGlow)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                  style={{ filter: "url(#blurOrange)" }}
                />
              )}

              {/*
                ─────────────────────────────────────────────
                LAYER 2 — Area utama (di depan, tajam)
                Garis sharp di atas + fill tipis di bawahnya.
                ─────────────────────────────────────────────
              */}
              {showDl && (
                <Area
                  type="monotoneX" dataKey="download" name="Download"
                  stroke={C.green} strokeWidth={2.5} fill="url(#gradDl)"
                  dot={<PeakDot color={C.green} threshold={peakThreshold} />}
                  activeDot={{ r: 5, fill: C.green, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
              {showUl && (
                <Area
                  type="monotoneX" dataKey="upload" name="Upload"
                  stroke={C.orange} strokeWidth={2.2} fill="url(#gradUl)"
                  dot={<PeakDot color={C.orange} threshold={peakThreshold} />}
                  activeDot={{ r: 5, fill: C.orange, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 6 }}>
              {commonAxis.grid}
              {commonAxis.xAxis}
              {commonAxis.yAxis}
              {commonAxis.tooltip}
              {commonAxis.legend}

              {showDl && (
                <Line
                  type="linear" dataKey="download" name="Download"
                  stroke={C.green} strokeWidth={2.2}
                  dot={<PeakDot color={C.green} threshold={peakThreshold} />}
                  activeDot={{ r: 5, fill: C.green, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
              {showUl && (
                <Line
                  type="linear" dataKey="upload" name="Upload"
                  stroke={C.orange} strokeWidth={2}
                  dot={<PeakDot color={C.orange} threshold={peakThreshold} />}
                  activeDot={{ r: 5, fill: C.orange, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartData.length > 0 && (
        <div style={{
          marginTop: 24,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(35,57,113,0.05)",
          border: `1px solid ${C.accent}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Dot color={activeColor} size={7} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary }}>
              Periode data
            </span>
          </div>
          <span style={{
            fontSize: 11,
            color: C.textPrimary,
            fontWeight: 600,
            textAlign: "right",
          }}>
            {dayjs(chartData[0]?.time).isValid() ? dayjs(chartData[0]?.time).format("DD MMMM YYYY HH:mm") : chartData[0]?.time}
            {" - "}
            {dayjs(chartData[chartData.length - 1]?.time).isValid() ? dayjs(chartData[chartData.length - 1]?.time).format("DD MMMM YYYY HH:mm") : chartData[chartData.length - 1]?.time}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Card Wrapper ─────────────────────────────────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{
    background: "linear-gradient(180deg, #ffffff 0%, #fafcff 100%)",
    border: "1px solid rgba(35,57,113,0.18)",
    borderTop: "3px solid #233971",
    borderRadius: 20,
    padding: "20px 16px",
    overflow: "hidden",
    boxShadow: "0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.08),0 20px 40px -8px rgba(0,0,0,0.09)",
    ...style,
  }}>
    {children}
  </div>
);

// ─── Export ───────────────────────────────────────────────────────────────────
export default function HistoryTrafficSection({
  rows        = [],
  summaryRows = [],
  historyMeta = null,
  cardStyle   = {},
}) {
  return (
    <Card style={cardStyle}>
      <TrafficChart
        rows={rows}
        summaryRows={summaryRows}
        historyMeta={historyMeta}
      />
    </Card>
  );
}
