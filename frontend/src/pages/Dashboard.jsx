import { useMemo, useState, useEffect, useRef } from "react";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import HistoryTrafficSection from "../components/HistoryTrafficSection";
import { API_BASE } from "../api";

/* ─── Template design tokens (from templateComponents.css / color.css) ─── */
const T = {
  navy:     "#1a2a57",
  navyMid:  "#2d4a8c",
  teal:     "#2a9d8f",
  tealDark: "#23857a",
  gold:     "#e9c46a",
  coral:    "#e76f51",
  purple:   "#9d4edd",
  text:     "#0f2035",
  textSoft: "#425575",
  muted:    "#5a6b88",
  border:   "rgba(26,42,87,0.10)",
  borderMid:"rgba(26,42,87,0.18)",
  surface:  "#ffffff",
  surfaceAlt:"rgba(248,249,250,0.95)",
  shadow:   "0 18px 36px rgba(17,38,75,0.08)",
};

const PIE_COLORS = [T.navy, T.teal, T.coral, T.gold, T.purple, T.navyMid, T.tealDark, "#a05c0a"];

const STATUS = {
  STABIL: { color:"#18786e", bg:"rgba(42,157,143,0.14)", border:"rgba(42,157,143,0.28)", label:"Stabil" },
  PADAT:  { color:"#8a680f", bg:"rgba(233,196,106,0.20)", border:"rgba(233,196,106,0.35)", label:"Padat"  },
  TINGGI: { color:"#b42318", bg:"rgba(231,111,81,0.14)",  border:"rgba(231,111,81,0.28)",  label:"Tinggi" },
};

/* ─── Responsive hook ─── */
function useBreakpoint() {
  const get = () => ({
    isMobile: window.innerWidth < 640,
    isTablet: window.innerWidth >= 640 && window.innerWidth < 1024,
  });
  const [bp, setBp] = useState(() => typeof window !== "undefined" ? get() : { isMobile:false, isTablet:false });
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
}

/* ─── Helpers ─── */
const shortLabel = (s = "") => s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();
const mbps = (v) => `${Number(v || 0).toFixed(1)} Mbps`;

/* ─── Primitives ─── */
const Dot = ({ color, size = 6 }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.STABIL;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <Dot color={s.color} size={5} />
      {s.label}
    </span>
  );
};

const ProgressBar = ({ value, color }) => (
  <div style={{ height: 5, borderRadius: 99, background: "rgba(26,42,87,0.08)", overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
  </div>
);

/* ─── Chart Tooltips ─── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.navy, border: `1px solid ${T.navyMid}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#e8eef8", boxShadow: "0 8px 24px rgba(13,31,60,0.28)", maxWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#a0b4cc", fontSize: 11, letterSpacing: "0.04em" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
          <Dot color={p.color} size={6} />
          <span style={{ color:"#8aa0ba" }}>{p.name}:</span>
          <span style={{ fontWeight:600, fontFamily:"'IBM Plex Mono',monospace" }}>{mbps(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: T.navy, border:`1px solid ${T.navyMid}`, borderRadius:12, padding:"12px 16px", boxShadow:"0 8px 24px rgba(13,31,60,0.30)", minWidth:190, pointerEvents:"auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, paddingBottom:8, borderBottom:"1px solid rgba(255,255,255,0.10)" }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:d.color, flexShrink:0 }} />
        <div style={{ fontSize:12, fontWeight:700, color:"#e8eef8" }}>{d.name}</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <span style={{ fontSize:11, color:"#8aa0ba" }}>Nilai</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff", fontFamily:"'IBM Plex Mono',monospace" }}>{d.value.toFixed(1)} Mbps</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <span style={{ fontSize:11, color:"#8aa0ba" }}>↓ Avg DL</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#7dd3fc", fontFamily:"'IBM Plex Mono',monospace" }}>{d.avgDownload.toFixed(1)} Mbps</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <span style={{ fontSize:11, color:"#8aa0ba" }}>↑ Avg UL</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#86efac", fontFamily:"'IBM Plex Mono',monospace" }}>{d.avgUpload.toFixed(1)} Mbps</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Stat Cards ─── */
const STAT_THEME = {
  "Total Host": { color: T.navy,     chipBg:"rgba(26,42,87,0.08)",    chipBorder:"rgba(26,42,87,0.18)" },
  "Stabil":     { color: "#18786e",  chipBg:"rgba(42,157,143,0.10)",  chipBorder:"rgba(42,157,143,0.22)" },
  "Padat":      { color: "#8a680f",  chipBg:"rgba(233,196,106,0.18)", chipBorder:"rgba(233,196,106,0.30)" },
  "Tinggi":     { color: "#b42318",  chipBg:"rgba(231,111,81,0.12)",  chipBorder:"rgba(231,111,81,0.24)" },
};

const StatCard = ({ label, value, sublabel, compact }) => {
  const t = STAT_THEME[label] || STAT_THEME["Total Host"];
  return (
    <div className="dashboard-card" style={{ gap: compact ? 6 : 12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <p className="dashboard-card__label" style={{ fontSize: compact ? 10.5 : undefined }}>{label}</p>
        {!compact && (
          <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99, fontSize:11, fontWeight:700, color:t.color, background:t.chipBg, border:`1px solid ${t.chipBorder}` }}>
            <Dot color={t.color} size={5} />
            {label}
          </span>
        )}
        {compact && <Dot color={t.color} size={7} />}
      </div>
      <strong className="dashboard-card__value" style={{ color: t.color, fontSize: compact ? "1.45rem" : undefined }}>{value}</strong>
      <p className="dashboard-card__detail" style={{ margin:0, fontSize: compact ? 11 : 12 }}>{sublabel}</p>
    </div>
  );
};

/* ─── Traffic Bar Chart ─── */
const TrafficChart = ({ rows = [], isMobile }) => {
  const data = useMemo(() => rows.map((r) => ({
    name: shortLabel(r.label),
    "Avg DL": +r.avg_download || 0,
    "Avg UL": +r.avg_upload || 0,
    "Peak DL": +r.peak_download || 0,
    "Peak UL": +r.peak_upload || 0,
  })), [rows]);

  if (!data.length) return (
    <div style={{ height:220, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, borderRadius:16, background:"rgba(26,42,87,0.03)", border:`1px dashed ${T.border}` }}>
      <p style={{ color:T.muted, fontSize:13, margin:0 }}>Generate report untuk melihat chart trafik.</p>
    </div>
  );

  const bars = [
    { key:"Avg DL",  color:T.navy },
    { key:"Avg UL",  color:T.teal },
    { key:"Peak DL", color:T.navyMid, opacity:0.65 },
    { key:"Peak UL", color:T.tealDark, opacity:0.65 },
  ];

  const mobileW = isMobile ? `${Math.max(340, data.length * 82)}px` : "100%";

  return (
    <>
      <div style={isMobile ? { overflowX:"auto", WebkitOverflowScrolling:"touch" } : {}}>
        <div style={{ width:mobileW, minWidth:mobileW }}>
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
            <BarChart data={data} barGap={2} margin={{ top:10, right:12, left:isMobile?-10:-10, bottom:isMobile?58:60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,42,87,0.06)" />
              <XAxis dataKey="name" tick={{ fill:T.muted, fontSize:isMobile?9.5:10 }} axisLine={false} tickLine={false} angle={-28} textAnchor="end" height={isMobile?68:70} interval={0} />
              <YAxis tick={{ fill:T.muted, fontSize:isMobile?9:10 }} axisLine={false} tickLine={false} width={isMobile?40:56} tickFormatter={(v) => `${v}M`} />
              <Tooltip content={<ChartTooltip />} />
              {bars.map(b => <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[4,4,0,0]} opacity={b.opacity ?? 1} legendType="none" />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:14, marginTop:8, flexWrap:"wrap" }}>
        {bars.map(({ key, color, opacity=1 }) => (
          <div key={key} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:color, opacity, flexShrink:0 }} />
            <span style={{ fontSize:11, color:T.muted, fontWeight:500 }}>{key}</span>
          </div>
        ))}
      </div>
    </>
  );
};

/* ─── Donut Chart ─── */
const DonutChart = ({ rows = [] }) => {
  const [activeTab, setActiveTab] = useState("combined");

  const data = useMemo(() => rows.map((r, i) => {
    const val = activeTab === "download" ? +r.avg_download || 0
              : activeTab === "upload"   ? +r.avg_upload || 0
              : (+r.avg_download || 0) + (+r.avg_upload || 0);
    return { name: shortLabel(r.label), value: val, avgDownload: +r.avg_download || 0, avgUpload: +r.avg_upload || 0, color: PIE_COLORS[i % PIE_COLORS.length] };
  }), [rows, activeTab]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const tabs = [{ key:"combined", label:"Total" }, { key:"download", label:"DL" }, { key:"upload", label:"UL" }];
  const tabColor = activeTab === "download" ? T.teal : activeTab === "upload" ? T.coral : T.navy;

  if (!rows.length) return (
    <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:T.muted, fontSize:13, margin:0 }}>Generate report untuk melihat distribusi.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:14, background:T.surfaceAlt, borderRadius:10, padding:4, border:`1px solid ${T.border}` }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={{
            flex:1, padding:"6px 0", borderRadius:7, fontSize:11, fontWeight:700,
            cursor:"pointer", transition:"all 0.18s",
            background: activeTab===t.key ? (t.key==="download"?T.teal:t.key==="upload"?T.coral:T.navy) : "transparent",
            color: activeTab===t.key ? "#fff" : T.muted,
            border: activeTab===t.key ? "none" : `1px solid ${T.border}`,
            fontFamily:"inherit",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ position:"relative", height:180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none" animationDuration={500}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<DonutTooltip />} wrapperStyle={{ pointerEvents:"auto", zIndex:40 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center", pointerEvents:"none" }}>
          <div style={{ fontSize:18, fontWeight:700, color:tabColor, lineHeight:1, fontFamily:"'IBM Plex Mono',monospace" }}>{total.toFixed(1)}</div>
          <div style={{ fontSize:9, color:T.muted, marginTop:4, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>
            {activeTab==="combined"?"Total Avg":activeTab==="download"?"Avg DL":"Avg UL"}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:10 }}>
        {data.map((d) => (
          <div key={d.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px", borderRadius:8, background:T.surfaceAlt, border:`1px solid ${T.border}`, gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
              <Dot color={d.color} size={7} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                <div style={{ fontSize:10.5, color:T.textSoft, marginTop:2, fontWeight:500 }}>↓ {d.avgDownload.toFixed(1)}M · ↑ {d.avgUpload.toFixed(1)}M</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", flexShrink:0, gap:2 }}>
              <span style={{ fontSize:12.5, fontWeight:700, color:tabColor, fontFamily:"'IBM Plex Mono',monospace" }}>{d.value.toFixed(1)}M</span>
              <span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>{total>0?((d.value/total)*100).toFixed(1):0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Summary Card (mobile) ─── */
const SummaryCard = ({ r }) => {
  const s = STATUS[r.status] || STATUS.STABIL;
  const score = Number(r.weighted_score || 0);
  return (
    <div style={{ borderRadius:14, border:`1px solid ${T.border}`, background:T.surface, overflow:"hidden", boxShadow:"0 1px 4px rgba(26,42,87,0.06)" }}>
      {/* header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px 10px", borderBottom:`1px solid ${T.border}`, gap:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:T.text, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {shortLabel(r.label)}
        </span>
        <StatusBadge status={r.status} />
      </div>
      {/* metrics grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
        {[
          { label:"Avg DL",  value: mbps(r.avg_download),  color:"#2a9d8f" },
          { label:"Avg UL",  value: mbps(r.avg_upload),    color:"#e76f51" },
          { label:"Peak DL", value: mbps(r.peak_download), color:"#2d4a8c" },
          { label:"Peak UL", value: mbps(r.peak_upload),   color:"#e9c46a" },
        ].map((m, i) => (
          <div key={m.label} style={{
            padding:"9px 14px",
            borderRight: i % 2 === 0 ? `1px solid ${T.border}` : "none",
            borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{m.label}</div>
            <div style={{ fontSize:13, fontWeight:700, color:m.color, fontFamily:"'IBM Plex Mono',monospace" }}>{m.value}</div>
          </div>
        ))}
      </div>
      {/* score bar */}
      <div style={{ padding:"9px 14px 11px", borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", flexShrink:0 }}>Score</span>
        <div style={{ flex:1, height:5, borderRadius:99, background:"rgba(26,42,87,0.07)", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${Math.min(score,100)}%`, background:s.color, borderRadius:99, transition:"width 0.5s ease" }} />
        </div>
        <span style={{ fontSize:12, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace", flexShrink:0 }}>{score}%</span>
      </div>
    </div>
  );
};

/* ─── Summary Table ─── */
const SummaryTable = ({ rows = [], isMobile }) => {
  if (!rows.length) return (
    <div style={{ padding:"40px 0", textAlign:"center" }}>
      <p style={{ color:T.muted, margin:0 }}>Generate report untuk melihat ringkasan trafik per host.</p>
    </div>
  );

  if (isMobile) return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:12 }}>
      {rows.map((r, i) => <SummaryCard key={i} r={r} />)}
    </div>
  );

  const cols = [
    { key:"label",          label:"Host / ISP",  render:(r) => shortLabel(r.label) },
    { key:"capacity",       label:"Cap (Mbps)",  render:(r) => r.capacity },
    { key:"avg_download",   label:"Avg DL",      render:(r) => mbps(r.avg_download) },
    { key:"avg_upload",     label:"Avg UL",      render:(r) => mbps(r.avg_upload) },
    { key:"peak_download",  label:"Peak DL",     render:(r) => mbps(r.peak_download) },
    { key:"peak_upload",    label:"Peak UL",     render:(r) => mbps(r.peak_upload) },
    { key:"weighted_score", label:"Score",       render:(r) => `${r.weighted_score}%` },
    { key:"status",         label:"Status",      render:(r) => <StatusBadge status={r.status} /> },
  ];
  const monoKeys = new Set(["capacity","avg_download","avg_upload","peak_download","peak_upload","weighted_score"]);

  return (
    <div className="users-table-wrapper">
      <table className="users-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} style={{
                  fontFamily: monoKeys.has(c.key) ? "'IBM Plex Mono',monospace" : "inherit",
                  fontWeight: c.key === "label" ? 600 : 400,
                  color: c.key === "label" ? T.text : T.textSoft,
                }}>
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

/* ─── Breakdown Grid ─── */
const BreakdownGrid = ({ items = [] }) => {
  if (!items.length) return (
    <div style={{ padding:"40px 0", textAlign:"center" }}>
      <p style={{ color:T.muted, margin:0 }}>Generate report untuk melihat breakdown weighted score per host.</p>
    </div>
  );

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:14 }}>
      {items.map((item) => {
        const s = STATUS[item.status] || STATUS.STABIL;
        return (
          <div key={item.label} className="dashboard-stack__item" style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <p style={{ margin:0, fontSize:13, fontWeight:600, color:T.text, flex:1, paddingRight:8, lineHeight:1.4 }}>{shortLabel(item.label)}</p>
              <StatusBadge status={item.status} />
            </div>
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Weighted Score</span>
                <span style={{ fontSize:12, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace" }}>{item.weighted_score}%</span>
              </div>
              <ProgressBar value={item.weighted_score} color={s.color} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { label:"Max Avg", pct:item.max_avg_pct, comp:item.avg_component, weight:"60%" },
                { label:"Max P95", pct:item.max_peak_pct, comp:item.peak_component, weight:"40%" },
              ].map((cc) => (
                <div key={cc.label} style={{ padding:"10px 12px", borderRadius:9, background:T.surface, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:10, color:T.muted, marginBottom:4, fontWeight:600 }}>{cc.label} <span style={{ opacity:.55 }}>× {cc.weight}</span></div>
                  <div style={{ fontSize:15, fontWeight:700, color:T.text, fontFamily:"'IBM Plex Mono',monospace" }}>{cc.pct}%</div>
                  <div style={{ fontSize:11, color:s.color, fontWeight:600, marginTop:2 }}>= {cc.comp}%</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Button ─── */
const Btn = ({ children, onClick, disabled, variant = "outline", color = T.navy, iconName, loading, fullWidth }) => {
  const [hover, setHover] = useState(false);
  const isPrimary = variant === "primary";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7,
        padding:"10px 16px", borderRadius:11, fontSize:13, fontWeight:700,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily:"inherit", whiteSpace:"nowrap",
        width: fullWidth ? "100%" : "auto",
        transition:"all 0.18s ease",
        transform: hover && !disabled ? "translateY(-1px)" : "translateY(0)",
        opacity: disabled ? 0.5 : 1,
        border: isPrimary ? "1px solid #1a2a57" : `1px solid ${hover ? `${color}55` : `${color}30`}`,
        background: isPrimary
          ? hover ? "#2d4a8c" : T.navy
          : hover ? `${color}18` : `${color}0d`,
        color: isPrimary ? "#ffffff" : color,
        boxShadow: isPrimary
          ? hover ? "0 8px 20px rgba(26,42,87,0.35)" : "0 4px 12px rgba(26,42,87,0.22)"
          : hover ? `0 4px 12px ${color}20` : "none",
      }}
    >
      {loading
        ? <span style={{ width:13, height:13, borderRadius:"50%", border:"2px solid currentColor", borderTopColor:"transparent", animation:"dash-spin 0.7s linear infinite", display:"inline-block" }} />
        : null
      }
      {children}
      <style>{`@keyframes dash-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
};

/* ─── Date Input ─── */
const DATE_INPUT_STYLE = `
  .dash-dateinput:hover { border-color: #1a2a57 !important; }
  .dash-dateinput:focus { border-color: #1a2a57 !important; box-shadow: 0 0 0 3px rgba(26,42,87,0.10) !important; background: #fff !important; }
  .dash-dateinput::-webkit-calendar-picker-indicator { opacity:0!important; pointer-events:none!important; position:absolute!important; width:0!important; height:0!important; padding:0!important; margin:0!important; }
  .dash-dateinput::-webkit-inner-spin-button { display:none!important; }
`;

const DateInput = ({ label, value, onChange, min, max }) => {
  const inputRef = useRef(null);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7, flex:1, minWidth:0 }}>
      <label style={{ fontSize:10.5, fontWeight:700, color:T.navy, letterSpacing:"0.07em", textTransform:"uppercase" }}>
        {label}
      </label>
      <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
        <button
          type="button"
          onClick={() => inputRef.current?.showPicker?.()}
          style={{ position:"absolute", left:11, zIndex:2, display:"flex", alignItems:"center", justifyContent:"center", width:30, height:30, borderRadius:8, background:"rgba(26,42,87,0.08)", border:"1px solid rgba(26,42,87,0.12)", cursor:"pointer", transition:"background 0.15s, border-color 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(26,42,87,0.15)"; e.currentTarget.style.borderColor="rgba(26,42,87,0.25)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="rgba(26,42,87,0.08)"; e.currentTarget.style.borderColor="rgba(26,42,87,0.12)"; }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke={T.navy} strokeWidth="1.4"/>
            <path d="M5 1v3M11 1v3" stroke={T.navy} strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M1.5 6.5h13" stroke={T.navy} strokeWidth="1.25"/>
            <rect x="3.5" y="8.5" width="2" height="2" rx="0.5" fill={T.navy}/>
            <rect x="7"   y="8.5" width="2" height="2" rx="0.5" fill={T.navy} opacity="0.7"/>
            <rect x="10.5" y="8.5" width="2" height="2" rx="0.5" fill={T.navy} opacity="0.45"/>
            <rect x="3.5" y="11.5" width="2" height="1.5" rx="0.5" fill={T.navy} opacity="0.45"/>
            <rect x="7"   y="11.5" width="2" height="1.5" rx="0.5" fill={T.navy} opacity="0.45"/>
          </svg>
        </button>
        <input
          ref={inputRef}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => inputRef.current?.showPicker?.()}
          className="dash-dateinput"
          style={{
            background:T.surface, border:"1.5px solid rgba(26,42,87,0.18)", borderRadius:11,
            padding:"11px 14px 11px 52px", color:T.text, fontSize:13, fontFamily:"inherit",
            outline:"none", width:"100%", boxSizing:"border-box",
            transition:"border-color 0.18s, box-shadow 0.18s",
            colorScheme:"light",
            boxShadow:"0 1px 3px rgba(26,42,87,0.06)",
          }}
        />
      </div>
    </div>
  );
};

/* ─── Section Title ─── */
const SectionTitle = ({ children, subtitle, compact }) => (
  <div style={{ marginBottom: compact ? 12 : 18 }}>
    <h3 style={{ margin:0, fontSize: compact ? 13.5 : 15, fontWeight:700, color:T.text, letterSpacing:"-0.02em" }}>{children}</h3>
    {subtitle && <p style={{ margin:"3px 0 0", fontSize: compact ? 11 : 11.5, color:T.muted }}>{subtitle}</p>}
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
  const [endDate, setEndDate]     = useState(maxDate);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [report, setReport]       = useState(null);

  const handleGenerate = async () => {
    if (!startDate || !endDate) { setError("Harap isi tanggal mulai dan akhir."); return; }
    if (startDate < minDate)    { setError("Start date tidak boleh lebih dari 1 bulan ke belakang."); return; }
    if (endDate > maxDate)      { setError("End date tidak boleh melebihi waktu sekarang."); return; }
    if (startDate >= endDate)   { setError("Start date harus lebih awal dari end date."); return; }
    try {
      setLoading(true); setError("");
      const { data } = await axios.get(`${API_BASE}/api/report/summary`, { params:{ start:startDate, end:endDate }, timeout:30000 });
      setReport(data);
    } catch (err) {
      setError(err?.code === "ECONNABORTED" ? "Request timeout." : err?.response?.data?.detail || err?.message || "Gagal mengambil data report.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () =>
    window.open(`${API_BASE}/api/report/export-pdf?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`, "_blank");

  const handleSendEmail = async () => {
    try {
      setLoading(true); setError("");
      await axios.post(`${API_BASE}/api/report/send-email`, {}, { params:{ start:startDate, end:endDate }, timeout:30000 });
      alert("Email berhasil dikirim.");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Gagal mengirim email.");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => [
    { label:"Total Host", value: report?.total_host ?? "–",              sublabel:"Host terpantau" },
    { label:"Stabil",     value: report?.status_count?.STABIL ?? "–",    sublabel:"Score ≤ 60%" },
    { label:"Padat",      value: report?.status_count?.PADAT  ?? "–",    sublabel:"Score 60–80%" },
    { label:"Tinggi",     value: report?.status_count?.TINGGI ?? "–",    sublabel:"Score > 80%" },
  ], [report]);

  const historyChartData = useMemo(() => report?.history_chart || [], [report]);
  const historyMeta      = useMemo(() => report?.history_meta || null, [report]);

  const gap = isMobile ? 12 : 16;

  return (
    <div className="dashboard-content" style={{ gap, gridTemplateColumns: "minmax(0, 1fr)", width: "100%" }}>
      <style>{DATE_INPUT_STYLE}</style>

      {/* ── Loading bar ── */}
      {loading && (
        <div style={{ position:"fixed", top:0, left:0, right:0, height:3, zIndex:9999, background:`linear-gradient(90deg,${T.navy},${T.navyMid},${T.teal})`, animation:"dash-spin-progress 1.6s ease-in-out infinite", transformOrigin:"left center" }}>
          <style>{`@keyframes dash-spin-progress { 0%{transform:scaleX(0) translateX(0)} 50%{transform:scaleX(0.6) translateX(50%)} 100%{transform:scaleX(0) translateX(200%)} }`}</style>
        </div>
      )}


{/* ── Date range & actions ── */}
      <div className="dashboard-panel" style={{ padding: isMobile?16:24 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:12 }}>
            <DateInput label="Start Date & Time" value={startDate} onChange={setStartDate} min={minDate} max={endDate} />
            <DateInput label="End Date & Time"   value={endDate}   onChange={setEndDate}   min={startDate} max={maxDate} />
          </div>

          {isMobile ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <Btn variant="primary" onClick={handleGenerate} disabled={loading} loading={loading} fullWidth>
                {loading ? "Generating…" : "Generate Report"}
              </Btn>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <Btn color={T.navy} onClick={handleExportPdf} disabled={loading} fullWidth>Export PDF</Btn>
                <Btn color={T.teal} onClick={handleSendEmail} disabled={loading} fullWidth>Kirim Email</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"auto auto auto 1fr", gap:8 }}>
              <Btn variant="primary" onClick={handleGenerate} disabled={loading} loading={loading}>
                {loading ? "Generating…" : "Generate Report"}
              </Btn>
              <Btn color={T.navy} onClick={handleExportPdf} disabled={loading}>Export PDF</Btn>
              <Btn color={T.teal} onClick={handleSendEmail} disabled={loading}>Kirim Email</Btn>
            </div>
          )}

          <div style={{ paddingTop:12, borderTop:`1px solid ${T.border}`, display:"flex", flexDirection: isMobile ? "column" : "row", justifyContent:"space-between", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 6 : 8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.navy, textTransform:"uppercase", letterSpacing:"0.07em" }}>Periode</span>
              <span style={{ fontSize: isMobile ? 11 : 12, color:T.textSoft, fontFamily:"'IBM Plex Mono',monospace" }}>
                {dayjs(startDate).format(isMobile ? "DD/MM/YY HH:mm" : "DD MMM YYYY HH:mm")} → {dayjs(endDate).format(isMobile ? "DD/MM/YY HH:mm" : "DD MMM YYYY HH:mm")}
              </span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Dot color={report ? T.teal : T.gold} size={6} />
              <span style={{ fontSize: isMobile ? 11 : 12, color: report ? "#18786e" : "#8a680f", fontWeight:500 }}>
                {report ? `${report.total_host} host dimuat` : "Belum ada data"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      <div style={{ overflow:"hidden", maxHeight: error ? 120 : 0, opacity: error ? 1 : 0, transition:"max-height 0.22s ease, opacity 0.18s ease", pointerEvents: error ? "auto" : "none" }}>
        <div style={{ padding:"12px 16px", borderRadius:10, background:"rgba(231,111,81,0.08)", border:"1px solid rgba(231,111,81,0.22)", color:"#b42318", fontSize:13, display:"flex", alignItems:"flex-start", gap:9, fontWeight:500 }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ lineHeight:1.5 }}>{error}</span>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap: isMobile?10:gap, opacity: loading ? 0.55 : 1, transition:"opacity 0.2s" }}>
        {stats.map((s) => <StatCard key={s.label} {...s} compact={isMobile} />)}
      </div>

      {/* ── History Traffic ── */}
      <div style={{ opacity: loading ? 0.55 : 1, transition:"opacity 0.2s", minWidth:0, overflow:"hidden" }}>
        <HistoryTrafficSection
          rows={historyChartData}
          summaryRows={report?.summary || []}
          historyMeta={historyMeta}
        />
      </div>

      {/* ── Charts ── */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile||isTablet?"1fr":"1fr 360px", gap, opacity: loading ? 0.55 : 1, transition:"opacity 0.2s" }}>
        <div className="dashboard-panel" style={{ padding: isMobile?14:22, overflow:"hidden", minWidth:0 }}>
          <SectionTitle subtitle="Rata-rata dan peak bandwidth per interface" compact={isMobile}>Traffic Chart</SectionTitle>
          <TrafficChart rows={report?.summary || []} isMobile={isMobile} />
        </div>
        <div className="dashboard-panel" style={{ padding: isMobile?14:22, overflow:"hidden", minWidth:0 }}>
          <SectionTitle subtitle="Distribusi avg bandwidth per host" compact={isMobile}>Distribusi Bandwidth</SectionTitle>
          <DonutChart rows={report?.summary || []} />
        </div>
      </div>

      {/* ── Summary Table ── */}
      <div className="dashboard-panel" style={{ padding: isMobile?14:22, overflow:"hidden", minWidth:0, opacity: loading ? 0.55 : 1, transition:"opacity 0.2s" }}>
        <SectionTitle subtitle="Data summary dari Zabbix API" compact={isMobile}>Ringkasan Trafik</SectionTitle>
        <div style={{ height:1, background:T.border, marginBottom:0 }} />
        <SummaryTable rows={report?.summary || []} isMobile={isMobile} />
      </div>

      {/* ── Breakdown ── */}
      <div className="dashboard-panel" style={{ padding: isMobile?14:22, overflow:"hidden", minWidth:0, opacity: loading ? 0.55 : 1, transition:"opacity 0.2s" }}>
        <SectionTitle subtitle="Score = (60% × Max Avg %) + (40% × Max P95 %)" compact={isMobile}>Breakdown Weighted Score</SectionTitle>
        <div style={{ height:1, background:T.border, marginBottom:14 }} />
        <BreakdownGrid items={report?.weighted_breakdown || []} />
      </div>

    </div>
  );
}
