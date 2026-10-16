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
import { CheckCircle, AlertTriangle, XCircle, Server04 } from "@untitledui/icons";
import HistoryTrafficSection from "../components/HistoryTrafficSection";
import { API_BASE } from "../api";
import { NS, PageHeader, Panel, Alert, Kpi, btn, fieldStyle, th, td, zebraRow } from "../components/ns";

const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const fmtTanggal = (d) => `${HARI[d.day()]}, ${d.date()} ${BULAN[d.month()]} ${d.year()}`;

/* ─── Template design tokens (from templateComponents.css / color.css) ─── */
const T = {
  navy:     "#24385b",
  navyMid:  "#2a5db0",
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

const DL = "#2a5db0", DL_LIGHT = "#9db8e6", UL = "#e08a2e", UL_LIGHT = "#f3c58e";
const PIE_COLORS = ["#2a5db0", "#e08a2e", "#3a9d6e", "#7b61c4", "#d0574a", "#2a9fb5", "#c9a227", "#8c8c8c"];

const STATUS = {
  STABIL: { color:NS.ok,   bg:NS.okBg,   border:NS.okBg,   label:"Stabil" },
  PADAT:  { color:NS.warn, bg:NS.warnBg, border:NS.warnBg, label:"Padat"  },
  TINGGI: { color:NS.bad,  bg:NS.badBg,  border:NS.badBg,  label:"Tinggi" },
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
      padding: "3px 10px", borderRadius: 3,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <Dot color={s.color} size={5} />
      {s.label}
    </span>
  );
};

/* ─── Stat tile (dipakai di header ringkasan, gaya sama kayak NOC Monitor) ─── */
const StatTile = ({ label, value, color, Icon }) => (
  <div className="dashboard-panel" style={{
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 3, padding: "10px 14px",
    display: "flex", alignItems: "center", gap: 10,
  }}>
    {Icon && (
      <span style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34, borderRadius: 3,
        background: `${color}1c`, color,
      }}>
        <Icon width={17} height={17} />
      </span>
    )}
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: T.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.15, fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>{value}</div>
    </div>
  </div>
);

const ProgressBar = ({ value, color }) => (
  <div style={{ height: 5, borderRadius: 3, background: "rgba(26,42,87,0.08)", overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
  </div>
);

/* ─── Chart Tooltips ─── */
const tipBox = { background:"#fff", borderRadius:3, padding:"8px 12px", fontSize:12, color:NS.text, boxShadow:"0 2px 8px rgba(0,0,0,0.18)", fontFamily:NS.font };

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...tipBox, minWidth:180 }}>
      <div style={{ fontWeight:700, marginBottom:6, color:NS.label, fontSize:11 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:2 }}>
          <span style={{ display:"flex", alignItems:"center", gap:6 }}><Dot color={p.color} size={8} />{p.name}</span>
          <b>{mbps(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ ...tipBox, minWidth:180 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, fontWeight:700, marginBottom:6 }}>
        <Dot color={d.color} size={8} />{d.name}
      </div>
      {[["Nilai", d.value], ["Rata-rata download", d.avgDownload], ["Rata-rata upload", d.avgUpload]].map(([k, v]) => (
        <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <span style={{ color:NS.label }}>{k}</span><b>{v.toFixed(1)} Mbps</b>
        </div>
      ))}
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
    <div style={{ height:220, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, borderRadius:3, background:"rgba(26,42,87,0.03)", border:`1px dashed ${T.border}` }}>
      <p style={{ color:T.muted, fontSize:13, margin:0 }}>Generate report untuk melihat chart trafik.</p>
    </div>
  );

  const bars = [
    { key:"Avg DL",  color:DL },
    { key:"Peak DL", color:DL_LIGHT },
    { key:"Avg UL",  color:UL },
    { key:"Peak UL", color:UL_LIGHT },
  ];

  const mobileW = isMobile ? `${Math.max(340, data.length * 82)}px` : "100%";

  return (
    <>
      <div style={isMobile ? { overflowX:"auto", WebkitOverflowScrolling:"touch" } : {}}>
        <div style={{ width:mobileW, minWidth:mobileW }}>
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
            <BarChart data={data} barGap={2} margin={{ top:10, right:12, left:isMobile?-10:-10, bottom:isMobile?58:60 }}>
              <CartesianGrid stroke="#ececec" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:T.muted, fontSize:isMobile?9.5:10 }} axisLine={false} tickLine={false} angle={-28} textAnchor="end" height={isMobile?68:70} interval={0} />
              <YAxis tick={{ fill:T.muted, fontSize:isMobile?9:10 }} axisLine={false} tickLine={false} width={isMobile?40:56} tickFormatter={(v) => `${v}M`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill:"rgba(42,93,176,0.06)" }} />
              {bars.map(b => <Bar key={b.key} dataKey={b.key} fill={b.color} radius={[2,2,0,0]} opacity={b.opacity ?? 1} legendType="none" />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:14, marginTop:8, flexWrap:"wrap" }}>
        {bars.map(({ key, color, opacity=1 }) => (
          <div key={key} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:color, opacity, flexShrink:0 }} />
            <span style={{ fontSize:12, color:NS.text }}>{key}</span>
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
  const tabs = [{ key:"combined", label:"Total" }, { key:"download", label:"Download" }, { key:"upload", label:"Upload" }];
  const tabColor = NS.text;

  if (!rows.length) return (
    <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:T.muted, fontSize:13, margin:0 }}>Generate report untuk melihat distribusi.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display:"inline-flex", marginBottom:14 }}>
        {tabs.map((t, i) => {
          const on = activeTab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={{
              height:30, padding:"0 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit",
              border:`1px solid ${on ? NS.primary : NS.field}`, marginLeft: i ? -1 : 0, position:"relative", zIndex: on ? 1 : 0,
              borderRadius: i === 0 ? "3px 0 0 3px" : i === tabs.length - 1 ? "0 3px 3px 0" : 0,
              background: on ? NS.hover : NS.surface, color: on ? NS.primary : NS.text,
            }}>{t.label}</button>
          );
        })}
      </div>

      <div style={{ display:"flex", gap:20, alignItems:"center" }}>
        <div style={{ position:"relative", width:190, height:190, flexShrink:0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={56} outerRadius={90} paddingAngle={3} stroke="none" animationDuration={500}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip content={<DonutTooltip />} wrapperStyle={{ pointerEvents:"auto", zIndex:40 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center", pointerEvents:"none" }}>
            <div style={{ fontSize:20, fontWeight:700, color:tabColor, lineHeight:1, fontFamily:"'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>{total.toFixed(1)}</div>
            <div style={{ fontSize:9, color:T.muted, marginTop:4, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>
              {activeTab==="combined"?"Total Avg":activeTab==="download"?"Avg DL":"Avg UL"}
            </div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:0, flex:1 }}>
          {data.map((d) => (
            <div key={d.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px", borderRadius:3, background:NS.zebra, gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:9, minWidth:0 }}>
                <Dot color={d.color} size={7} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                  <div style={{ fontSize:10.5, color:T.textSoft, marginTop:2, fontWeight:500 }}>↓ {d.avgDownload.toFixed(1)}M · ↑ {d.avgUpload.toFixed(1)}M</div>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", flexShrink:0, gap:2 }}>
                <span style={{ fontSize:13, fontWeight:700, color:tabColor, fontFamily:"'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>{d.value.toFixed(1)}M</span>
                <span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>{total>0?((d.value/total)*100).toFixed(1):0}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Summary Card (mobile) ─── */
const SummaryCard = ({ r }) => {
  const s = STATUS[r.status] || STATUS.STABIL;
  const score = Number(r.weighted_score || 0);
  return (
    <div style={{ borderRadius:3, border:`1px solid ${T.border}`, background:T.surface, overflow:"hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
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
          { label:"Peak DL", value: mbps(r.peak_download), color:"#2a5db0" },
          { label:"Peak UL", value: mbps(r.peak_upload),   color:"#e9c46a" },
        ].map((m, i) => (
          <div key={m.label} style={{
            padding:"9px 14px",
            borderRight: i % 2 === 0 ? `1px solid ${T.border}` : "none",
            borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{m.label}</div>
            <div style={{ fontSize:13, fontWeight:700, color:m.color, fontFamily:"'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>{m.value}</div>
          </div>
        ))}
      </div>
      {/* score bar */}
      <div style={{ padding:"9px 14px 11px", borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.06em", flexShrink:0 }}>Score</span>
        <div style={{ flex:1, height:5, borderRadius:3, background:"rgba(26,42,87,0.07)", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${Math.min(score,100)}%`, background:s.color, borderRadius:3, transition:"width 0.5s ease" }} />
        </div>
        <span style={{ fontSize:12, fontWeight:700, color:s.color, fontFamily:"'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif", flexShrink:0 }}>{score}%</span>
      </div>
    </div>
  );
};

/* ─── Summary Table ─── */
const SummaryTable = ({ rows = [] }) => {
  const [hover, setHover] = useState(null);
  if (!rows.length) return (
    <div style={{ padding:"24px 12px", textAlign:"center", color:NS.label, fontSize:13 }}>
      Generate report untuk melihat ringkasan trafik per host.
    </div>
  );

  const heads = ["Host / ISP", "Kapasitas", "Avg DL", "Avg UL", "Peak DL", "Peak UL", "Score", "Status"];
  const numCols = ["avg_download", "avg_upload", "peak_download", "peak_upload"];
  const tag = (text, color, title) => (
    <span title={title} style={{ fontSize:10, fontWeight:700, color, background:NS.zebra, borderRadius:3, padding:"1px 5px" }}>{text}</span>
  );

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", minWidth:840, borderCollapse:"collapse" }}>
        <thead>
          <tr>
            {heads.map((h, i) => <th key={h} style={{ ...th, textAlign: i === 0 || i === 7 ? "left" : "right" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const s = STATUS[r.status] || STATUS.STABIL;
            const score = Number(r.weighted_score || 0);
            return (
              <tr key={i} style={zebraRow(i, hover === i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <td style={{ ...td, whiteSpace:"nowrap" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontWeight:600, color:NS.link }}>{shortLabel(r.label)}</span>
                    {r.vpn_measured && tag("VPN", NS.label, "Latency/loss diukur lewat VPN — bobot kualitas dikecilkan")}
                    {r.is_standby && tag("CADANGAN", NS.ok, r.standby_note)}
                  </span>
                </td>
                <td style={{ ...td, textAlign:"right", color:NS.label, whiteSpace:"nowrap" }}>{r.capacity}</td>
                {numCols.map((k) => (
                  <td key={k} style={{ ...td, textAlign:"right", whiteSpace:"nowrap" }}>
                    {Number(r[k] || 0).toFixed(1)}<span style={{ color:NS.muted, fontSize:11, marginLeft:3 }}>Mbps</span>
                  </td>
                ))}
                <td style={{ ...td, textAlign:"right", fontWeight:700, color:s.color }}>{score}%</td>
                <td style={{ ...td, fontWeight:700, color:s.color }} title={r.status_reason ? `Pemicu status: ${r.status_reason}` : undefined}>
                  {s.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ─── Breakdown Table ─── */
const BreakdownGrid = ({ items = [] }) => {
  const [hover, setHover] = useState(null);
  if (!items.length) return (
    <div style={{ padding:"24px 12px", textAlign:"center", color:NS.label, fontSize:13 }}>
      Generate report untuk melihat breakdown weighted score per host.
    </div>
  );
  const heads = ["Host / ISP", "Weighted score", "Utilisasi (× 80%)", "Kualitas link (× 20%)", "Status", "Pemicu status"];
  return (
    <>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", minWidth:900, borderCollapse:"collapse" }}>
          <thead>
            <tr>{heads.map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const s = STATUS[item.status] || STATUS.STABIL;
              const score = Number(item.weighted_score || 0);
              return (
                <tr key={item.label} style={zebraRow(i, hover === i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <td style={{ ...td, fontWeight:600, color:NS.link, whiteSpace:"nowrap" }}>{shortLabel(item.label)}</td>
                  <td style={{ ...td, minWidth:150 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ flex:1, height:6, borderRadius:3, background:NS.colHead, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(score, 100)}%`, background:s.color }} />
                      </div>
                      <b style={{ color:s.color, minWidth:44, textAlign:"right" }}>{score}%</b>
                    </div>
                  </td>
                  <td style={td}>
                    {item.util_score} <span style={{ color:NS.label }}>→ {item.util_component}</span>
                    <div style={{ fontSize:11, color:NS.muted }}>Avg {item.max_avg_pct}% · P95 {item.max_peak_pct}% · Peak {item.max_peakraw_pct}%</div>
                  </td>
                  <td style={td}>
                    {item.quality_penalty} <span style={{ color:NS.label }}>→ {item.quality_component}</span>
                    <div style={{ fontSize:11, color:NS.muted }}>latency {item.latency_penalty} · loss {item.loss_penalty}</div>
                  </td>
                  <td style={{ ...td, fontWeight:700, color:s.color }}>{s.label}</td>
                  <td style={{ ...td, color:NS.label, fontSize:12, maxWidth:320 }}>{item.status_reason || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding:"8px 12px", fontSize:12, color:NS.label, background:NS.zebra }}>
        Utilisasi = 0,50 × Avg + 0,35 × P95 + 0,15 × Peak. Kualitas link = nilai terburuk dari penalti latency dan loss.
      </div>
    </>
  );
};

/* ─── Button ─── */
const Btn = ({ children, onClick, disabled, variant, fullWidth }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ ...btn(variant === "primary", disabled), width: fullWidth ? "100%" : "auto" }}>
    {children}
  </button>
);

/* ─── Date Input ─── */
const DateInput = ({ label, value, onChange, min, max }) => {
  const inputRef = useRef(null);
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:4, flex:1, minWidth:0 }}>
      <span style={{ fontSize:11, fontWeight:700, color:NS.label, textTransform:"uppercase", letterSpacing:"0.03em" }}>{label}</span>
      <input
        ref={inputRef}
        type="datetime-local"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => inputRef.current?.showPicker?.()}
        style={{ ...fieldStyle, colorScheme:"light" }}
      />
    </label>
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
export default function TrafficReport() {
  const now = dayjs();
  const minDate = now.subtract(1, "month").format("YYYY-MM-DDTHH:mm");
  const maxDate = now.format("YYYY-MM-DDTHH:mm");

  const { isMobile, isTablet } = useBreakpoint();

  // Default: laporan harian — kemarin 03:00 s/d hari ini 00:00
  const [startDate, setStartDate] = useState(
    now.startOf("day").subtract(1, "day").add(3, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [endDate, setEndDate]     = useState(now.startOf("day").format("YYYY-MM-DDTHH:mm"));
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [report, setReport]       = useState(null);
  const [clock, setClock]         = useState(() => dayjs());

  useEffect(() => {
    const t = setInterval(() => setClock(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // Begitu halaman dibuka, langsung tampilin data H-1 (rentang tanggal default)
  // tanpa nunggu diklik "Generate Report" dulu — tombol generate tetap ada &
  // tetap jalan biasa buat rentang tanggal lain.
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportPdf = () =>
    window.open(`${API_BASE}/api/report/export-pdf?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&_=${Date.now()}`, "_blank");

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

  const historyChartData = useMemo(() => report?.history_chart || [], [report]);
  const historyMeta      = useMemo(() => report?.history_meta || null, [report]);

  const statusCounts = useMemo(() => {
    const rows = report?.summary || [];
    return {
      total: rows.length,
      stabil: rows.filter((r) => r.status === "STABIL").length,
      padat: rows.filter((r) => r.status === "PADAT").length,
      tinggi: rows.filter((r) => r.status === "TINGGI").length,
    };
  }, [report]);

  const dim = { opacity: loading ? 0.55 : 1, transition:"opacity 0.2s", minWidth:0 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, width:"100%", fontFamily:NS.font, color:NS.text }}>
      <PageHeader
        title="Traffic Report"
        subtitle={report
          ? `${statusCounts.total} connections · ${statusCounts.stabil} stable · ${statusCounts.padat} busy · ${statusCounts.tinggi} high load`
          : "Bandwidth per internet connection for the selected period"}
        actions={<>
          <Btn onClick={handleExportPdf} disabled={loading}>Export PDF</Btn>
          <Btn onClick={handleSendEmail} disabled={loading}>Send Email</Btn>
        </>}
      />

      <Panel title="Periode Laporan" pad={12}>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto", gap:12, alignItems:"end" }}>
          <DateInput label="Mulai" value={startDate} onChange={setStartDate} min={minDate} max={endDate} />
          <DateInput label="Selesai" value={endDate} onChange={setEndDate} min={startDate} max={maxDate} />
          <Btn variant="primary" onClick={handleGenerate} disabled={loading} fullWidth={isMobile}>
            {loading ? "Memuat…" : "Generate Report"}
          </Btn>
        </div>
      </Panel>

      {error && <Alert tone="bad" title="Terjadi kesalahan">{error}</Alert>}

      <div style={dim}>
        <HistoryTrafficSection
          rows={historyChartData}
          summaryRows={report?.summary || []}
          historyMeta={historyMeta}
        />
      </div>

      <div style={{ display:"grid", gridTemplateColumns: isMobile||isTablet ? "1fr" : "1fr 1fr", gap:14, ...dim }}>
        <Panel title="Traffic Chart" right="Rata-rata & peak per interface" pad={isMobile ? 10 : 14}>
          <TrafficChart rows={report?.summary || []} isMobile={isMobile} />
        </Panel>
        <Panel title="Distribusi Bandwidth" right="Avg bandwidth per host" pad={isMobile ? 10 : 14}>
          <DonutChart rows={report?.summary || []} />
        </Panel>
      </div>

      <Panel title="Ringkasan Trafik" right={report ? `Total: ${(report.summary || []).length} host` : null} style={dim}>
        <SummaryTable rows={report?.summary || []} />
      </Panel>

      <Panel title="Breakdown Weighted Score" right="Score = 80% utilisasi + 20% kualitas link" style={dim}>
        <BreakdownGrid items={report?.weighted_breakdown || []} />
      </Panel>
    </div>
  );

}
