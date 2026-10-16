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
import { MarkerPin05 } from "@untitledui/icons";
import { NS, Band, fieldStyle } from "./ns";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const C = {
  surface:       "#ffffff",
  bg:            "#f0f4f9",
  accent:        "#24385b",
  accentLight:   "#2a5db0",
  green:         "#2a5db0",
  greenBg:       "rgba(0,200,117,0.08)",
  greenBorder:   "rgba(0,200,117,0.22)",
  orange:        "#e08a2e",
  orangeBg:      "rgba(245,158,11,0.08)",
  orangeBorder:  "rgba(245,158,11,0.22)",
  border:        "rgba(35,57,113,0.09)",
  borderMid:     "rgba(35,57,113,0.16)",
  textPrimary:   "#0d1f3c",
  textSecondary: "#3d5278",
  textMuted:     "#7a90b0",
  textHint:      "#8a8a8a",
};

const HOST_COLORS = [
  "#24385b", "#00c875", "#f59e0b", "#ef4444",
  "#6d28d9", "#0891b2", "#0f766e", "#b45309",
  "#2a5db0", "#9333ea", "#15803d", "#dc2626",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const shortLabel = (s = "") =>
  s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();

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
// Strip inline tipis — bukan kartu kotak besar, biar gak makan tempat.
const MetricCard = ({ label, value, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
    <Dot color={color} size={6} />
    <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}
    </span>
    <span style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, fontVariantNumeric: "tabular-nums" }}>
      {Number(value || 0).toFixed(1)}
    </span>
    <span style={{ fontSize: 9.5, color: C.textMuted, fontWeight: 600 }}>Mbps</span>
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
      borderRadius: 3,
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
// Gaya horizontal kompak — samain sama "noc-device-summary" di NOC Monitor
// (ikon kecil + nama + dot status dalam satu baris), biar gak makan tempat.
const RouterChip = ({ host, index, isActive, avgDl, onSelect, color = C.accent }) => {
  const clean = shortLabel(host);

  return (
    <button
      onClick={() => onSelect(host)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", textAlign: "left",
        padding: "8px 10px",
        borderRadius: 3,
        border: `1px solid ${isActive ? color : "rgba(35,57,113,0.12)"}`,
        background: isActive ? `${color}12` : "rgba(35,57,113,0.03)",
        cursor: "pointer",
        transition: "all 0.16s ease",
        WebkitTapHighlightColor: "transparent",
        fontFamily: "inherit",
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 3, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}1c`, color,
      }}>
        <MarkerPin05 width={12} height={12} />
      </span>
      <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: isActive ? color : "#2a3a5c",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {clean}
        </span>
        {avgDl !== null && (
          <span style={{ fontSize: 9.5, fontWeight: 600, color: C.textMuted, fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>
            ↓ {Number(avgDl).toFixed(1)} M
          </span>
        )}
      </span>
      {isActive && (
        <span style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: color, boxShadow: `0 0 0 3px ${color}2e`,
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
      background: "#fff", borderRadius: 3, padding: "8px 12px", fontSize: 12, minWidth: 170,
      boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontFamily: NS.font,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: NS.label, marginBottom: 6 }}>{fmtDateTime(label)}</div>
      {payload.map((p) =>
        p.name && !p.name.startsWith("__") ? (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 2 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: NS.text }}>
              <Dot color={p.color} size={8} /> {p.name}
            </span>
            <b style={{ color: NS.text }}>{toMbps(p.value)}</b>
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
      <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
};

// ─── Main Chart Component ─────────────────────────────────────────────────────
const TrafficChart = ({ rows = [], summaryRows = [], historyMeta = null }) => {
  const normalizedRows = useMemo(() => {
    const fallback = historyMeta?.selected_label || summaryRows?.[0]?.label || "Router";
    if ((rows || []).length > 0) {
      return rows.map((r) => ({
        ...r,
        host: r.host || r.label || r.name || r.router || r.selected_label || fallback,
      }));
    }
    // Fallback ke summaryRows ketika tidak ada data time-series
    return (summaryRows || []).map((s) => ({
      ...s,
      host:     s.label || fallback,
      time:     s.label,
      download: +s.avg_download || 0,
      upload:   +s.avg_upload   || 0,
    }));
  }, [rows, summaryRows, historyMeta]);

  const grouped = useMemo(() => {
    const map = {};
    normalizedRows.forEach((r) => {
      const key = r.host || "Router";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [normalizedRows]);

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

  // Tiap router dijatah warna berbeda secara berurutan dari HOST_COLORS,
  // biar gampang dibedain di chip pemilih & sinkron sama warna aktifnya.
  const hostColorMap = useMemo(() => {
    const m = {};
    hostList.forEach((h, i) => { m[h] = HOST_COLORS[i % HOST_COLORS.length]; });
    return m;
  }, [hostList]);

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

  if (!hostList.length) {
    return (
      <div>
        <Band>History Traffic</Band>
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: NS.text }}>Belum ada data history traffic</div>
          <div style={{ fontSize: 12, color: NS.label, marginTop: 4 }}>Pilih rentang tanggal lalu klik Generate Report.</div>
        </div>
      </div>
    );
  }

  // Pakai summary row agar nilai metrik sama persis dengan ReportTable
  const activeSummaryRow = summaryRows.find((s) => s.label === activeKey);
  const peakDl = activeSummaryRow
    ? +activeSummaryRow.peak_download || 0
    : Math.max(...chartData.map((d) => d.download), 0);
  const peakUl = activeSummaryRow
    ? +activeSummaryRow.peak_upload || 0
    : Math.max(...chartData.map((d) => d.upload), 0);
  const avgDl = activeSummaryRow
    ? +activeSummaryRow.avg_download || 0
    : chartData.length ? chartData.reduce((s, d) => s + d.download, 0) / chartData.length : 0;
  const avgUl = activeSummaryRow
    ? +activeSummaryRow.avg_upload || 0
    : chartData.length ? chartData.reduce((s, d) => s + d.upload, 0) / chartData.length : 0;

  const maxVal = Math.max(
    ...chartData.map((d) => Math.max(showDl ? d.download : 0, showUl ? d.upload : 0)), 0
  );
  const yMax          = maxVal <= 10 ? 10 : Math.ceil(maxVal / 10) * 10;
  const peakThreshold = maxVal * 0.88;
  const activeColor   = hostColorMap[activeKey] || C.accent;

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
      <CartesianGrid stroke="#ececec" vertical={false} />
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
            <span style={{ fontWeight: 600, color: NS.text }}>
              {val}
            </span>
          );
        }}
      />
    ),
  };

  return (
    <div>
      <Band right={chartData.length > 0
        ? `${chartData.length} titik data · ${fmtDateTime(chartData[0]?.time)} → ${fmtDateTime(chartData[chartData.length - 1]?.time)}`
        : `${chartData.length} titik data`}>
        History Traffic
      </Band>
      <div style={{ padding: "14px 16px" }}>
      {/* ── Kontrol: router, mode grafik, seri ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, flex: "0 1 320px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Router / ISP
          </span>
          <select value={activeKey || ""} onChange={(e) => setSelectedHost(e.target.value)} style={fieldStyle}>
            {hostList.map((h) => <option key={h} value={h}>{shortLabel(h)}</option>)}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>Tampilan</span>
          <div style={{ display: "inline-flex" }}>
            {[["smooth", "Halus"], ["detail", "Detail"]].map(([k, label], i) => {
              const on = chartMode === k;
              return (
                <button key={k} onClick={() => setChartMode(k)} style={{
                  height: 30, padding: "0 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: NS.font,
                  border: `1px solid ${on ? NS.primary : NS.field}`, marginLeft: i ? -1 : 0, position: "relative", zIndex: on ? 1 : 0,
                  borderRadius: i ? "0 3px 3px 0" : "3px 0 0 3px",
                  background: on ? NS.hover : NS.surface, color: on ? NS.primary : NS.text,
                }}>{label}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", height: 30 }}>
          {[["Download", showDl, setShowDl, C.green], ["Upload", showUl, setShowUl, C.orange]].map(([label, on, set, col]) => (
            <label key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: NS.text }}>
              <input type="checkbox" checked={on} onChange={() => set((v) => !v)} style={{ accentColor: col, width: 15, height: 15 }} />
              <span style={{ width: 14, height: 3, background: col, borderRadius: 2 }} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* ── Ringkasan angka ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1,
        background: NS.colHead, borderRadius: 3, overflow: "hidden", marginBottom: 14,
      }}>
        {[["Peak download", peakDl, C.green], ["Peak upload", peakUl, C.orange], ["Rata-rata download", avgDl, C.green], ["Rata-rata upload", avgUl, C.orange]].map(([label, v, col]) => (
          <div key={label} style={{ background: NS.zebra, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: col, marginTop: 2 }}>
              {Number(v || 0).toFixed(1)} <span style={{ fontSize: 12, fontWeight: 600, color: NS.label }}>Mbps</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Grafik ── */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        {chartMode === "smooth" ? (
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 6 }}>
              <defs>
                <linearGradient id="gradDl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.green} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gradUl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={C.orange} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={C.orange} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              {commonAxis.grid}
              {commonAxis.xAxis}
              {commonAxis.yAxis}
              {commonAxis.tooltip}
              {commonAxis.legend}

              {showDl && (
                <Area
                  type="monotoneX" dataKey="download" name="Download"
                  stroke={C.green} strokeWidth={1.8} fill="url(#gradDl)"
                  dot={<PeakDot color={C.green} threshold={peakThreshold} />}
                  activeDot={{ r: 4, fill: C.green, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
              {showUl && (
                <Area
                  type="monotoneX" dataKey="upload" name="Upload"
                  stroke={C.orange} strokeWidth={1.8} fill="url(#gradUl)"
                  dot={<PeakDot color={C.orange} threshold={peakThreshold} />}
                  activeDot={{ r: 4, fill: C.orange, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 6 }}>
              {commonAxis.grid}
              {commonAxis.xAxis}
              {commonAxis.yAxis}
              {commonAxis.tooltip}
              {commonAxis.legend}

              {showDl && (
                <Line
                  type="linear" dataKey="download" name="Download"
                  stroke={C.green} strokeWidth={1.6}
                  dot={<PeakDot color={C.green} threshold={peakThreshold} />}
                  activeDot={{ r: 4, fill: C.green, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
              {showUl && (
                <Line
                  type="linear" dataKey="upload" name="Upload"
                  stroke={C.orange} strokeWidth={1.6}
                  dot={<PeakDot color={C.orange} threshold={peakThreshold} />}
                  activeDot={{ r: 4, fill: C.orange, stroke: "#fff", strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      </div>
    </div>
  );
};

// ─── Card Wrapper ─────────────────────────────────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{
    background: NS.surface,
    borderRadius: 3,
    overflow: "hidden",
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
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
