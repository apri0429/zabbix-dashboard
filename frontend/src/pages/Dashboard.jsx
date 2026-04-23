import { useMemo, useState, useEffect } from "react";
import axios from "axios";
import dayjs from "dayjs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import HistoryTrafficSection from "../components/HistoryTrafficSection";

import { API_BASE } from "../api";

/* ─── Design Tokens ─── */
const C = {
  bg: "#edf1fa",
  surface: "#ffffff",
  surfaceAlt: "#f5f8fc",
  surfaceHover: "rgba(35,57,113,0.04)",
  navy: "#233971",
  navyMid: "#1c2e5a",
  navyLight: "#2d4a96",
  accent: "#233971",
  accentLight: "#3a5aa0",
  green: "#146e3c",
  greenLight: "#18a057",
  amber: "#a45c0a",
  amberLight: "#d97706",
  red: "#991b1b",
  redLight: "#dc2626",
  border: "rgba(13,31,60,0.10)",
  borderMid: "rgba(13,31,60,0.18)",
  textPrimary: "#0d1f3c",
  textSecondary: "#3d5278",
  textMuted: "#7a90b0",
};

const PIE_COLORS = [
  "#233971", "#146e3c", "#991b1b", "#a45c0a",
  "#4e3b9e", "#0e7490", "#1d6a8a", "#7c4a14",
];

const STATUS = {
  STABIL: { color: C.green, bg: "rgba(20,110,60,0.08)", border: "rgba(20,110,60,0.22)", label: "Stabil" },
  PADAT: { color: C.amber, bg: "rgba(164,92,10,0.08)", border: "rgba(164,92,10,0.22)", label: "Padat" },
  TINGGI: { color: C.red, bg: "rgba(153,27,27,0.08)", border: "rgba(153,27,27,0.22)", label: "Tinggi" },
};

/* ─── Global CSS ─── */
const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: ${C.bg};
    color: ${C.textPrimary};
    font-family: 'Inter', sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px; background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(35,57,113,0.15); border-radius: 99px; }
  ::selection { background: rgba(35,57,113,0.15); }

  input[type="datetime-local"] {
    color-scheme: light;
    font-family: 'Inter', sans-serif;
    color: ${C.textPrimary};
    width: 100%;
    min-width: 0;
    max-width: 100%;
    appearance: none;
    -webkit-appearance: none;
    line-height: 1.2;
    background: transparent;
  }

  input[type="datetime-local"]::-webkit-date-and-time-value {
    text-align: left;
  }

  input[type="datetime-local"]::-webkit-clear-button,
  input[type="datetime-local"]::-webkit-inner-spin-button {
    display: none;
  }

  input[type="datetime-local"]::-webkit-calendar-picker-indicator {
    position: absolute;
    right: 0;
    top: 0;
    width: 44px;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 3;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.65;transform:scale(1.12);} }
  @keyframes progress { 0%{transform:scaleX(0) translateX(0)} 50%{transform:scaleX(0.6) translateX(50%)} 100%{transform:scaleX(0) translateX(200%)} }

  table tbody tr:hover td { background-color: rgba(35,57,113,0.025) !important; }

  input:focus {
    border-color: #233971 !important;
    box-shadow: 0 0 0 3px rgba(35,57,113,0.12) !important;
    outline: none !important;
  }

  [data-dashboard-page="true"] button[data-dashboard-btn="true"][data-variant="primary"]:hover {
    background: linear-gradient(135deg,#3d5ca8 0%,#233971 55%,#1a2d5a 100%) !important;
    color: #ffffff !important;
    border-color: #3d5ca8 !important;
  }

  @media (max-width: 640px) {
    input[type="datetime-local"] {
      font-size: 16px !important;
    }
  }
`;

/* ─── Helpers ─── */
const shortLabel = (s = "") =>
  s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();
const mbps = (v) => `${Number(v || 0).toFixed(1)} Mbps`;

/* ─── Responsive hook ─── */
function useBreakpoint() {
  const get = () => ({
    isMobile: window.innerWidth < 640,
    isTablet: window.innerWidth >= 640 && window.innerWidth < 1024,
    isDesktop: window.innerWidth >= 1024,
    w: window.innerWidth,
  });

  const [bp, setBp] = useState(() =>
    typeof window !== "undefined"
      ? get()
      : { isMobile: false, isTablet: false, isDesktop: true, w: 1280 }
  );

  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return bp;
}

/* ─── SVG Icons ─── */
const ICONS = {
  monitor: ["M2 3h20a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 21h8", "M12 17v4"],
  check: "M20 6L9 17l-5-5",
  alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  chart: ["M18 20V10", "M12 20V4", "M6 20v-6"],
  pie: ["M21.21 15.89A10 10 0 1 1 8 2.83", "M22 12A10 10 0 0 0 12 2v10z"],
  table: ["M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"],
  microscope: ["M6 18h8", "M3 22h18", "M14 22a7 7 0 1 0 0-14h-1", "M9 14h2", "M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z", "M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  mail: ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6l-10 7L2 6"],
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  wifi: ["M1.42 9a16 16 0 0 1 21.16 0", "M5 12.55a11 11 0 0 1 14.08 0", "M8.53 16.11a6 6 0 0 1 6.95 0", "M12 20h.01"],
  layers: ["M12 2L2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  server: ["M3 5h18", "M5 9h14", "M3 13h18", "M5 17h14", "M7 9h.01", "M7 17h.01"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"],
  bars: ["M5 20V10", "M12 20V4", "M19 20v-7"],
  calendar: ["M8 2v4", "M16 2v4", "M3 10h18", "M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
};

const SvgIcon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.75, opacity = 1 }) => {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: "block", opacity }}
    >
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
};

/* ─── Primitives ─── */
const Card = ({ children, style, accent }) => (
  <div
    style={{
      background: C.surface,
      border: "1px solid rgba(35,57,113,0.14)",
      borderRadius: 20,
      padding: 20,
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.06),0 20px 40px -8px rgba(0,0,0,0.07)",
      ...(accent ? { borderTop: `3px solid ${accent}` } : {}),
      ...style,
    }}
  >
    {children}
  </div>
);

const Badge = ({ children, color, bg, border }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 9px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.03em",
      color,
      background: bg,
      border: `1px solid ${border}`,
    }}
  >
    {children}
  </span>
);

const Dot = ({ color, size = 6 }) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      display: "inline-block",
      flexShrink: 0,
    }}
  />
);

const Label = ({ children, style }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 700,
      color: "#1e3a5f",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      ...style,
    }}
  >
    {children}
  </span>
);

const Divider = ({ style }) => (
  <div style={{ height: 1, background: "rgba(35,57,113,0.12)", ...style }} />
);

/* ─── Chart Tooltip ─── */
const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: C.navy,
      border: `1px solid ${C.navyMid}`,
      borderRadius: 12,
      padding: "12px 16px",
      boxShadow: "0 8px 24px rgba(13,31,60,0.30)",
      minWidth: 190,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color, flexShrink: 0, boxShadow: `0 0 0 3px ${d.color}30` }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e8eef8", lineHeight: 1.3 }}>{d.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#8aa0ba", fontWeight: 500 }}>Nilai</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", fontFamily: "'JetBrains Mono', monospace" }}>{d.value.toFixed(1)} Mbps</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#8aa0ba", fontWeight: 500 }}>↓ Avg DL</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#7dd3fc", fontFamily: "'JetBrains Mono', monospace" }}>{d.avgDownload.toFixed(1)} Mbps</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#8aa0ba", fontWeight: 500 }}>↑ Avg UL</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#86efac", fontFamily: "'JetBrains Mono', monospace" }}>{d.avgUpload.toFixed(1)} Mbps</span>
        </div>
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: C.navy,
        border: `1px solid ${C.navyMid}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        color: "#e8eef8",
        boxShadow: "0 8px 24px rgba(13,31,60,0.28)",
        maxWidth: 200,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: "#a0b4cc",
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
          <Dot color={p.color} size={6} />
          <span style={{ color: "#8aa0ba" }}>{p.name}:</span>
          <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{mbps(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

/* ─── StatCard ─── */
const getStatTheme = (label) => {
  const key = (label || "").toLowerCase();

  if (key.includes("total")) {
    return {
      color: C.accent,
      softBg: "linear-gradient(180deg,#f8fbff 0%,rgba(35,57,113,0.06) 100%)",
      chipBg: "rgba(35,57,113,0.10)",
      chipBorder: "rgba(35,57,113,0.18)",
      chipText: C.accent,
      ghost: "rgba(35,57,113,0.08)",
      ghost2: "rgba(35,57,113,0.04)",
      iconName: "server",
    };
  }

  if (key.includes("stabil")) {
    return {
      color: C.green,
      softBg: "linear-gradient(180deg,#f8fffb 0%,#eefaf3 100%)",
      chipBg: "rgba(20,110,60,0.10)",
      chipBorder: "rgba(20,110,60,0.18)",
      chipText: C.green,
      ghost: "rgba(20,110,60,0.08)",
      ghost2: "rgba(20,110,60,0.04)",
      iconName: "shield",
    };
  }

  if (key.includes("padat")) {
    return {
      color: C.amber,
      softBg: "linear-gradient(180deg,#fffdf8 0%,#fff6ea 100%)",
      chipBg: "rgba(164,92,10,0.10)",
      chipBorder: "rgba(164,92,10,0.18)",
      chipText: C.amber,
      ghost: "rgba(164,92,10,0.08)",
      ghost2: "rgba(164,92,10,0.04)",
      iconName: "bars",
    };
  }

  return {
    color: C.red,
    softBg: "linear-gradient(180deg,#fffafa 0%,#fff1f1 100%)",
    chipBg: "rgba(153,27,27,0.10)",
    chipBorder: "rgba(153,27,27,0.18)",
    chipText: C.red,
    ghost: "rgba(153,27,27,0.08)",
    ghost2: "rgba(153,27,27,0.04)",
    iconName: "alert",
  };
};

const StatCard = ({ label, value, sublabel, isMobile }) => {
  const t = getStatTheme(label);

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: t.softBg,
        border: "1px solid rgba(35,57,113,0.14)",
        borderRadius: 20,
        padding: isMobile ? "16px 14px 14px" : "20px 20px 18px",
        boxShadow: "0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.06),0 20px 40px -8px rgba(0,0,0,0.07)",
        minHeight: isMobile ? 150 : 170,
      }}
    >
      <div
        style={{
          position: "absolute",
          right: isMobile ? -6 : -2,
          bottom: isMobile ? -4 : -2,
          width: isMobile ? 92 : 120,
          height: isMobile ? 92 : 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${t.ghost} 0%, ${t.ghost2} 45%, transparent 72%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <SvgIcon
          name={t.iconName}
          size={isMobile ? 56 : 74}
          color={t.color}
          strokeWidth={1.7}
          opacity={0.12}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: isMobile ? -18 : -20,
          right: isMobile ? 18 : 26,
          width: isMobile ? 70 : 90,
          height: isMobile ? 70 : 90,
          borderRadius: "50%",
          border: `1px dashed ${t.ghost}`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: isMobile ? -10 : -12,
          bottom: isMobile ? 16 : 18,
          width: isMobile ? 70 : 88,
          height: isMobile ? 70 : 88,
          borderRadius: 20,
          background: `linear-gradient(180deg, ${t.ghost2} 0%, transparent 100%)`,
          pointerEvents: "none",
          transform: "rotate(-8deg)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: isMobile ? 10 : 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div
            style={{
              width: isMobile ? 42 : 48,
              height: isMobile ? 42 : 48,
              borderRadius: 14,
              background: "#ffffff",
              border: "1px solid rgba(35,57,113,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 18px rgba(13,31,60,0.04)",
            }}
          >
            <SvgIcon name={t.iconName} size={isMobile ? 18 : 20} color={t.color} strokeWidth={2} />
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 12,
              fontSize: isMobile ? 10.5 : 11.5,
              fontWeight: 700,
              color: t.chipText,
              background: t.chipBg,
              border: `1px solid ${t.chipBorder}`,
              whiteSpace: "nowrap",
            }}
          >
            <Dot color={t.color} size={6} />
            {label}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: isMobile ? 30 : 40,
              fontWeight: 700,
              lineHeight: 1,
              color: t.color,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.05em",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {value}
          </div>

          <div style={{ fontSize: isMobile ? 10 : 11.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {label}
          </div>

          <div style={{ fontSize: isMobile ? 10 : 11.5, color: C.textMuted, fontWeight: 400, lineHeight: 1.5, maxWidth: "82%" }}>
            {sublabel}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.STABIL;
  return (
    <Badge color={s.color} bg={s.bg} border={s.border}>
      <Dot color={s.color} size={5} />
      {s.label}
    </Badge>
  );
};

const ProgressBar = ({ value, color, height = 4 }) => (
  <div style={{ height, borderRadius: 99, background: "rgba(13,31,60,0.07)", overflow: "hidden" }}>
    <div
      style={{
        height: "100%",
        width: `${Math.min(value, 100)}%`,
        background: color,
        borderRadius: 99,
        transition: "width 0.5s ease",
      }}
    />
  </div>
);

/* ─── TrafficChart ─── */
const TrafficChart = ({ rows = [], isMobile }) => {
  const data = useMemo(() => rows.map((r) => ({
    name: shortLabel(r.label),
    "Avg DL": +r.avg_download || 0,
    "Avg UL": +r.avg_upload || 0,
    "Peak DL": +r.peak_download || 0,
    "Peak UL": +r.peak_upload || 0,
  })), [rows]);

  if (!data.length) {
    return (
      <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 16, background: "rgba(35,57,113,0.03)", border: "1px dashed rgba(35,57,113,0.15)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(35,57,113,0.10)", border: "1px solid rgba(35,57,113,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SvgIcon name="chart" size={26} color={C.accent} strokeWidth={1.75} opacity={0.8} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>Belum ada data trafik</div>
          <div style={{ fontSize: 11.5, color: C.textSecondary, marginTop: 5, maxWidth: 240, lineHeight: 1.5 }}>Generate report untuk melihat chart trafik bandwidth.</div>
        </div>
      </div>
    );
  }

  const mobileW = isMobile ? `${Math.max(340, data.length * 82)}px` : "100%";
  const barItems = [
    { key: "Avg DL", color: "#233971" },
    { key: "Avg UL", color: "#0e7490" },
    { key: "Peak DL", color: "#0d1f3c", opacity: 0.65 },
    { key: "Peak UL", color: "#134e6e", opacity: 0.65 },
  ];

  return (
    <>
      <div style={isMobile ? { overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" } : {}}>
        <div style={{ width: mobileW, minWidth: mobileW }}>
          <ResponsiveContainer width="100%" height={isMobile ? 248 : 348}>
            <BarChart data={data} barGap={2} margin={{ top: 10, right: 12, left: isMobile ? -10 : -10, bottom: isMobile ? 58 : 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,31,60,0.06)" />
              <XAxis
                dataKey="name"
                tick={{ fill: C.textMuted, fontSize: isMobile ? 9.5 : 10 }}
                axisLine={false}
                tickLine={false}
                angle={-28}
                textAnchor="end"
                height={isMobile ? 68 : 70}
                interval={0}
              />
              <YAxis
                tick={{ fill: C.textMuted, fontSize: isMobile ? 9 : 10 }}
                axisLine={false}
                tickLine={false}
                width={isMobile ? 40 : 56}
                tickFormatter={(v) => `${v}M`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="Avg DL" fill="#233971" radius={[4, 4, 0, 0]} legendType="none" />
              <Bar dataKey="Avg UL" fill="#0e7490" radius={[4, 4, 0, 0]} legendType="none" />
              <Bar dataKey="Peak DL" fill="#0d1f3c" radius={[4, 4, 0, 0]} opacity={0.65} legendType="none" />
              <Bar dataKey="Peak UL" fill="#134e6e" radius={[4, 4, 0, 0]} opacity={0.65} legendType="none" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 10 : 16, marginTop: 6, flexWrap: "wrap" }}>
        {barItems.map(({ key, color, opacity = 1 }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity, flexShrink: 0 }} />
            <span style={{ fontSize: isMobile ? 9.5 : 11, color: C.textSecondary, fontWeight: 500 }}>{key}</span>
          </div>
        ))}
      </div>
    </>
  );
};

/* ─── DonutChart ─── */
const DonutChart = ({ rows = [] }) => {
  const [activeTab, setActiveTab] = useState("combined");

  const data = useMemo(() => rows.map((r, i) => {
    const val =
      activeTab === "download" ? +r.avg_download || 0 :
      activeTab === "upload" ? +r.avg_upload || 0 :
      (+r.avg_download || 0) + (+r.avg_upload || 0);

    return {
      name: shortLabel(r.label),
      value: val,
      avgDownload: +r.avg_download || 0,
      avgUpload: +r.avg_upload || 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  }), [rows, activeTab]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const tabs = [{ key: "combined", label: "Total" }, { key: "download", label: "DL" }, { key: "upload", label: "UL" }];
  const tabColor = activeTab === "download" ? "#18a057" : activeTab === "upload" ? "#f97316" : C.accent;

  if (!rows.length) {
    return (
      <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 16, background: "rgba(35,57,113,0.03)", border: "1px dashed rgba(35,57,113,0.15)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(35,57,113,0.10)", border: "1px solid rgba(35,57,113,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SvgIcon name="pie" size={26} color={C.accent} strokeWidth={1.75} opacity={0.8} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>Belum ada data distribusi</div>
          <div style={{ fontSize: 11.5, color: C.textSecondary, marginTop: 5, maxWidth: 240, lineHeight: 1.5 }}>Generate report untuk melihat distribusi bandwidth per router.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 5, marginBottom: 14, background: C.surfaceAlt, borderRadius: 10, padding: 4, border: "1px solid rgba(35,57,113,0.12)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: "pointer",
              transition: "all 0.18s",
              background: activeTab === t.key ? (t.key === "download" ? "#18a057" : t.key === "upload" ? "#f97316" : C.accent) : "rgba(35,57,113,0.06)",
              color: activeTab === t.key ? "#fff" : C.textSecondary,
              border: activeTab === t.key ? "none" : "1px solid rgba(35,57,113,0.12)",
              boxShadow: activeTab === t.key ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ position: "relative", height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none" animationBegin={0} animationDuration={500}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: tabColor, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            {total.toFixed(1)}
          </div>
          <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {activeTab === "combined" ? "Total Avg" : activeTab === "download" ? "Avg DL" : "Avg UL"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
        {data.map((d) => (
          <div
            key={d.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px",
              borderRadius: 8,
              background: C.surfaceAlt,
              border: "1px solid rgba(35,57,113,0.10)",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Dot color={d.color} size={7} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 10.5, color: C.textSecondary, marginTop: 2, whiteSpace: "nowrap", fontWeight: 500 }}>
                  ↓ {d.avgDownload.toFixed(1)}M &nbsp;·&nbsp; ↑ {d.avgUpload.toFixed(1)}M
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: tabColor, fontFamily: "'JetBrains Mono', monospace" }}>
                {d.value.toFixed(1)}M
              </span>
              <span style={{ fontSize: 10, color: C.textSecondary, fontWeight: 600 }}>
                {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── SummaryTable ─── */
const SummaryTable = ({ rows = [], isMobile }) => {
  if (!rows.length) {
    return (
      <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 16, background: "rgba(35,57,113,0.03)", border: "1px dashed rgba(35,57,113,0.15)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(35,57,113,0.10)", border: "1px solid rgba(35,57,113,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SvgIcon name="table" size={26} color={C.accent} strokeWidth={1.75} opacity={0.8} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>Belum ada data ringkasan</div>
          <div style={{ fontSize: 11.5, color: C.textSecondary, marginTop: 5, maxWidth: 240, lineHeight: 1.5 }}>Generate report untuk melihat ringkasan trafik per host.</div>
        </div>
      </div>
    );
  }

  const cols = isMobile
    ? [
        { key: "label", label: "Host", render: (r) => shortLabel(r.label) },
        { key: "avg_download", label: "Avg DL", render: (r) => mbps(r.avg_download) },
        { key: "avg_upload", label: "Avg UL", render: (r) => mbps(r.avg_upload) },
        { key: "weighted_score", label: "Score", render: (r) => `${r.weighted_score}%` },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]
    : [
        { key: "label", label: "Host / ISP", render: (r) => shortLabel(r.label) },
        { key: "capacity", label: "Cap (Mbps)", render: (r) => r.capacity },
        { key: "avg_download", label: "Avg DL", render: (r) => mbps(r.avg_download) },
        { key: "avg_upload", label: "Avg UL", render: (r) => mbps(r.avg_upload) },
        { key: "peak_download", label: "Peak DL", render: (r) => mbps(r.peak_download) },
        { key: "peak_upload", label: "Peak UL", render: (r) => mbps(r.peak_upload) },
        { key: "weighted_score", label: "Score", render: (r) => `${r.weighted_score}%` },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ];

  const monoKeys = new Set(["capacity", "avg_download", "avg_upload", "peak_download", "peak_upload", "weighted_score"]);

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 12 : 13, minWidth: isMobile ? 460 : "auto" }}>
        <thead>
          <tr style={{ background: "linear-gradient(180deg,rgba(35,57,113,0.07) 0%,rgba(249,250,251,0.85) 100%)" }}>
            {cols.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: isMobile ? "10px 10px" : "12px 14px",
                  textAlign: "left",
                  color: "#1e3a5f",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  borderBottom: "2px solid rgba(35,57,113,0.14)",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid rgba(243,244,246,0.95)", transition: "background 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: isMobile ? "9px 10px" : "11px 14px",
                    color: c.key === "label" ? C.textPrimary : C.textSecondary,
                    whiteSpace: "nowrap",
                    fontFamily: monoKeys.has(c.key) ? "'JetBrains Mono', monospace" : "inherit",
                    fontWeight: c.key === "label" ? 600 : 400,
                    fontSize: isMobile ? 11.5 : 13,
                  }}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─── BreakdownGrid ─── */
const BreakdownGrid = ({ items = [], isMobile }) => {
  if (!items.length) {
    return (
      <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, borderRadius: 16, background: "rgba(35,57,113,0.03)", border: "1px dashed rgba(35,57,113,0.15)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(35,57,113,0.10)", border: "1px solid rgba(35,57,113,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SvgIcon name="microscope" size={26} color={C.accent} strokeWidth={1.75} opacity={0.8} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>Belum ada data breakdown</div>
          <div style={{ fontSize: 11.5, color: C.textSecondary, marginTop: 5, maxWidth: 240, lineHeight: 1.5 }}>Generate report untuk melihat breakdown weighted score per host.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: isMobile ? 10 : 14 }}>
      {items.map((item) => {
        const s = STATUS[item.status] || STATUS.STABIL;
        return (
          <div
            key={item.label}
            style={{
              padding: isMobile ? 14 : 18,
              borderRadius: 12,
              background: C.surfaceAlt,
              border: "1px solid rgba(35,57,113,0.10)",
              transition: "transform 0.16s, border-color 0.16s, box-shadow 0.16s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = s.border;
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(13,31,60,0.10)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "rgba(35,57,113,0.10)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, flex: 1, paddingRight: 8, lineHeight: 1.4 }}>
                {shortLabel(item.label)}
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Label>Weighted Score</Label>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.weighted_score}%
                </span>
              </div>
              <ProgressBar value={item.weighted_score} color={s.color} height={5} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Max Avg", pct: item.max_avg_pct, comp: item.avg_component, weight: "60%" },
                { label: "Max P95", pct: item.max_peak_pct, comp: item.peak_component, weight: "40%" },
              ].map((cc) => (
                <div key={cc.label} style={{ padding: "10px 12px", borderRadius: 9, background: C.surface, border: "1px solid rgba(35,57,113,0.10)" }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>
                    {cc.label} <span style={{ opacity: 0.55 }}>× {cc.weight}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
                    {cc.pct}%
                  </div>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 2 }}>
                    = {cc.comp}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── SectionTitle ─── */
const SectionTitle = ({ children, subtitle, iconName, isMobile, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 14 : 20, gap: 8 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {iconName && (
        <div style={{
          width: isMobile ? 36 : 42,
          height: isMobile ? 36 : 42,
          borderRadius: 12,
          background: "linear-gradient(135deg, rgba(35,57,113,0.12) 0%, rgba(35,57,113,0.06) 100%)",
          border: "1px solid rgba(35,57,113,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 6px rgba(35,57,113,0.08)",
        }}>
          <SvgIcon name={iconName} size={isMobile ? 16 : 19} color={C.accent} strokeWidth={2} />
        </div>
      )}
      <div>
        <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
          {children}
        </div>
        {subtitle && !isMobile && (
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
    </div>
    {right}
  </div>
);

/* ─── Button ─── */
const Btn = ({
  children,
  onClick,
  disabled,
  variant = "outline",
  color = C.accent,
  iconName,
  loading,
  fullWidth,
}) => {
  const [isHover, setIsHover] = useState(false);
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      data-dashboard-btn="true"
      data-variant={isPrimary ? "primary" : "outline"}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        outline: "none",
        backgroundImage: "none",
        WebkitTapHighlightColor: "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        padding: "10px 16px",
        borderRadius: 11,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'Inter', sans-serif",
        whiteSpace: "nowrap",
        width: fullWidth ? "100%" : "auto",
        transition: "all 0.18s ease",
        transform: isHover && !disabled ? "translateY(-1px)" : "translateY(0)",
        opacity: disabled ? 0.52 : 1,
        border: isPrimary
          ? "1px solid #233971"
          : `1px solid ${isHover ? `${color}55` : `${color}30`}`,
        background: isPrimary
          ? isHover
            ? "linear-gradient(135deg,#3d5ca8 0%,#233971 55%,#1a2d5a 100%)"
            : "linear-gradient(135deg,#5c7cff 0%,#3d5ca8 45%,#233971 100%)"
          : isHover
            ? `${color}18`
            : `${color}0d`,
        color: isPrimary ? "#ffffff" : color,
        boxShadow: isPrimary
          ? isHover
            ? "0 10px 24px rgba(35,57,113,0.40)"
            : "0 6px 16px rgba(35,57,113,0.28)"
          : isHover
            ? `0 6px 16px ${color}20`
            : "none",
      }}
    >
      {loading ? (
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      ) : (
        iconName && <SvgIcon name={iconName} size={14} color="currentColor" strokeWidth={2.2} />
      )}
      {children}
    </button>
  );
};

/* ─── DateInput ─── */
const DateInput = ({ label, value, onChange, min, max, isMobile }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 6,
      flex: 1,
      minWidth: 0,
      width: "100%",
    }}
  >
    <Label>{label}</Label>

    <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <input
        type="datetime-local"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.surfaceAlt,
          border: "1px solid rgba(35,57,113,0.20)",
          borderRadius: 11,
          padding: isMobile ? "12px 48px 12px 12px" : "10px 42px 10px 12px",
          color: C.textPrimary,
          fontSize: isMobile ? 16 : 13,
          fontFamily: "'Inter', sans-serif",
          outline: "none",
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          width: 20,
          height: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <SvgIcon
          name="calendar"
          size={17}
          color={isMobile ? "#3d5ca8" : "#5f7fbf"}
          strokeWidth={2}
        />
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════ */
export default function Dashboard() {
  const now = dayjs();
  const minDate = now.subtract(1, "month").format("YYYY-MM-DDTHH:mm");
  const maxDate = now.format("YYYY-MM-DDTHH:mm");

  const { isMobile, isTablet } = useBreakpoint();

  const [startDate, setStartDate] = useState(now.subtract(7, "day").format("YYYY-MM-DDTHH:mm"));
  const [endDate, setEndDate] = useState(maxDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [tick, setTick] = useState(dayjs());

  useEffect(() => {
    const t = setInterval(() => setTick(dayjs()), 60000);
    return () => clearInterval(t);
  }, []);

  const handleStartChange = (val) => {
    setStartDate(val);
  };

  const handleEndChange = (val) => {
    setEndDate(val);
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      setError("Harap isi tanggal mulai dan akhir.");
      return;
    }
    if (startDate < minDate) {
      setError("Start date tidak boleh lebih dari 1 bulan ke belakang.");
      return;
    }
    if (endDate > maxDate) {
      setError("End date tidak boleh melebihi waktu sekarang.");
      return;
    }
    if (startDate >= endDate) {
      setError("Start date harus lebih awal dari end date.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      setReport(null);
      const { data } = await axios.get(`${API_BASE}/api/report/summary`, {
        params: { start: startDate, end: endDate },
        timeout: 30000,
      });
      setReport(data);
    } catch (err) {
      setError(
        err?.code === "ECONNABORTED"
          ? "Request timeout. Server terlalu lama merespons."
          : err?.response?.data?.detail || err?.message || "Gagal mengambil data report."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () =>
    window.open(
      `${API_BASE}/api/report/export-pdf?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
      "_blank"
    );

  const handleSendEmail = async () => {
    try {
      setLoading(true);
      setError("");
      await axios.post(`${API_BASE}/api/report/send-email`, {}, {
        params: { start: startDate, end: endDate },
        timeout: 30000,
      });
      alert("Email berhasil dikirim.");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Gagal mengirim email.");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => [
    { label: "Total Host", value: report?.total_host ?? "–", sublabel: "Host terpantau" },
    { label: "Stabil", value: report?.status_count?.STABIL ?? "–", sublabel: "Score ≤ 60%" },
    { label: "Padat", value: report?.status_count?.PADAT ?? "–", sublabel: "Score 60–80%" },
    { label: "Tinggi", value: report?.status_count?.TINGGI ?? "–", sublabel: "Score > 80%" },
  ], [report]);

  const historyChartData = useMemo(() => report?.history_chart || report?.timeseries || [], [report]);
  const historyMeta = useMemo(() => report?.history_meta || null, [report]);

  const pad = isMobile ? "12px" : isTablet ? "16px 18px" : "20px 24px";
  const gap = isMobile ? 12 : 14;
  const cardPad = isMobile ? 14 : 20;

  return (
    <>
      <style>{globalStyle}</style>

      {loading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 9999,
            background: "linear-gradient(90deg,#1a2d5a,#233971,#3d5ca8)",
            animation: "progress 1.6s ease-in-out infinite",
            transformOrigin: "left center",
          }}
        />
      )}

      <div style={{ width: "100%", padding: pad }} data-dashboard-page="true">
        {/* ── Hero Card ── */}
        <div
          style={{
            position: "relative",
            background: "linear-gradient(135deg,#233971 0%,#1c2e5a 60%,#0f1e40 100%)",
            borderRadius: 20,
            border: "1px solid rgba(35,57,113,0.14)",
            overflow: "hidden",
            boxShadow: "0 0 0 1px rgba(229,231,235,0.5),0 4px 6px -1px rgba(35,57,113,0.06),0 20px 40px -8px rgba(0,0,0,0.07)",
            marginBottom: gap,
          }}
        >
          <div style={{ position: "absolute", top: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,0.10) 0%,transparent 65%)", pointerEvents: "none", zIndex: 0 }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle,rgba(255,255,255,0.08) 1px,transparent 1px)", backgroundSize: "28px 28px", backgroundPosition: "14px 14px", pointerEvents: "none", zIndex: 0 }} />

          {/* header */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: isMobile ? "14px 16px" : "22px 28px",
              background: "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: isMobile ? 38 : 46,
                  height: isMobile ? 38 : 46,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: "linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.10) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.20)",
                }}
              >
                <SvgIcon name="wifi" size={isMobile ? 18 : 22} color="rgba(255,255,255,0.90)" strokeWidth={1.8} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: isMobile ? 15 : 21, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.4px", lineHeight: 1.25 }}>
                  Network Traffic Report
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: isMobile ? 11 : 13, color: "rgba(255,255,255,0.65)" }}>
                  Zabbix Monitoring · realtime
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {!isMobile && ["Zabbix API", "FastAPI"].map((t) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "5px 11px",
                    borderRadius: 9,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.85)",
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.20)",
                  }}
                >
                  {t}
                </span>
              ))}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "#fff",
                  padding: isMobile ? "6px 12px" : "8px 16px",
                  borderRadius: 11,
                  fontSize: isMobile ? 11 : 13,
                  fontWeight: 600,
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.20)",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.85, animation: "pulse 2s ease-in-out infinite", display: "inline-block" }} />
                {loading ? "Processing…" : "Live"}
              </span>
            </div>
          </div>

          {/* sub-header */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: isMobile ? "10px 16px" : "12px 28px",
              background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 100%)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: isMobile ? 11 : 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6 }}>
              {isMobile
                ? "Monitoring trafik jaringan berbasis Zabbix API"
                : "Dashboard monitoring trafik jaringan berbasis Zabbix API — analisa performa, export laporan, dan notifikasi email."}
            </span>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <SvgIcon name="layers" size={11} color="rgba(255,255,255,0.50)" strokeWidth={2} />
              {tick.format("HH:mm")} · {tick.format("DD MMM YYYY")}
            </div>
          </div>
        </div>

        {/* ── Date Range & Actions ── */}
        <Card style={{ marginBottom: gap, padding: cardPad }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 12,
                width: "100%",
              }}
            >
              <DateInput label="Start Date & Time" value={startDate} onChange={handleStartChange} min={minDate} max={endDate} isMobile={isMobile} />
              <DateInput label="End Date & Time" value={endDate} onChange={handleEndChange} min={startDate} max={maxDate} isMobile={isMobile} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto auto auto 1fr", gap: 8 }}>
              <Btn variant="primary" color="#233971" onClick={handleGenerate} disabled={loading} loading={loading} iconName="bolt" fullWidth={isMobile}>
                {loading ? "Generating…" : "Generate Report"}
              </Btn>
              <Btn color={C.accent} onClick={handleExportPdf} disabled={loading} iconName="download" fullWidth={isMobile}>
                Export PDF
              </Btn>
              <Btn color={C.amber} onClick={handleSendEmail} disabled={loading} iconName="mail" fullWidth={isMobile}>
                Kirim Email
              </Btn>
            </div>

            <div
              style={{
                paddingTop: 12,
                borderTop: "1px solid rgba(35,57,113,0.12)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
                <Label style={{ paddingTop: 2 }}>Periode</Label>
                <span
                  style={{
                    fontSize: isMobile ? 11 : 13,
                    color: C.textSecondary,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: isMobile ? "normal" : "nowrap",
                    wordBreak: "break-word",
                    lineHeight: 1.5,
                    minWidth: 0,
                  }}
                >
                  {dayjs(startDate).format(isMobile ? "DD MMM YYYY HH:mm" : "DD MMM YYYY HH:mm")} → {dayjs(endDate).format(isMobile ? "DD MMM YYYY HH:mm" : "DD MMM YYYY HH:mm")}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {!isMobile && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#1e3a5f",
                      background: "rgba(35,57,113,0.06)",
                      border: "1px solid rgba(35,57,113,0.18)",
                      padding: "3px 9px",
                      borderRadius: 99,
                    }}
                  >
                    <SvgIcon name="layers" size={11} color="#233971" strokeWidth={2} />
                    {dayjs(minDate).format("DD MMM")} – {dayjs(maxDate).format("DD MMM YYYY")}
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Dot color={report ? C.greenLight : C.amberLight} size={6} />
                  <span style={{ fontSize: 12, color: report ? C.green : C.amber, fontWeight: 500 }}>
                    {report ? `${report.total_host} host dimuat` : "Belum ada data"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: gap,
              background: "rgba(153,27,27,0.07)",
              border: "1px solid rgba(153,27,27,0.20)",
              color: C.red,
              fontSize: 13,
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              fontWeight: 500,
            }}
          >
            <SvgIcon name="alert" size={15} color={C.red} strokeWidth={2} />
            <span style={{ lineHeight: 1.5 }}>{error}</span>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: isMobile ? 10 : gap,
            marginBottom: gap,
          }}
        >
          {stats.map((s) => (
            <StatCard key={s.label} {...s} isMobile={isMobile} />
          ))}
        </div>

        <HistoryTrafficSection
          rows={historyChartData}
          summaryRows={report?.summary || []}
          historyMeta={historyMeta}
          cardStyle={{ marginBottom: gap }}
        />

        {/* ── Charts ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 360px",
            gap,
            marginBottom: gap,
          }}
        >
          <Card accent={C.accent} style={{ padding: cardPad }}>
            <SectionTitle iconName="chart" subtitle="Rata-rata dan peak bandwidth per interface" isMobile={isMobile}>
              Traffic Chart
            </SectionTitle>
            <TrafficChart rows={report?.summary || []} isMobile={isMobile} />
          </Card>

          <Card accent="#0e7490" style={{ padding: cardPad }}>
            <SectionTitle iconName="pie" subtitle="Distribusi avg bandwidth per host" isMobile={isMobile}>
              Distribusi Bandwidth
            </SectionTitle>
            <DonutChart rows={report?.summary || []} />
          </Card>
        </div>

        <Card accent={C.accent} style={{ marginBottom: gap, padding: cardPad }}>
          <SectionTitle iconName="table" subtitle="Data summary dari Zabbix API" isMobile={isMobile}>
            Ringkasan Trafik
          </SectionTitle>
          <Divider style={{ marginBottom: 0 }} />
          <SummaryTable rows={report?.summary || []} isMobile={isMobile} />
        </Card>

        <Card accent={C.navyLight} style={{ marginBottom: gap, padding: cardPad }}>
          <SectionTitle iconName="microscope" subtitle="Score = (60% × Max Avg %) + (40% × Max P95 %)" isMobile={isMobile}>
            Breakdown Weighted Score
          </SectionTitle>
          <Divider style={{ marginBottom: 14 }} />
          <BreakdownGrid items={report?.weighted_breakdown || []} isMobile={isMobile} />
        </Card>
      </div>
    </>
  );
}
