import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import {
  Wifi, Dataflow04, CpuChip01, Server05, Box,
  MarkerPin05, CheckCircle, AlertTriangle, XCircle, AlertCircle, Server04,
  Clipboard, BarChartSquare02, XClose, Users01, Clock, Calendar,
  Download04, Globe05, SearchMd,
} from "@untitledui/icons";
import { API_BASE } from "../api";

/* ─── Palet warna ───
   LIGHT dipakai saat NOC ditempel di dashboard biasa. WALL dipakai khusus mode
   Layar Penuh: command center terang, bersih, dan tetap kontras untuk TV NOC. */
function buildPalette(dark) {
  if (!dark) {
    return {
      dark: false,
      navy: "#1a2a57", navyMid: "#2d4a8c", teal: "#2a9d8f", coral: "#e76f51",
      text: "#0f2035", textSoft: "#425575", muted: "#5a6b88",
      border: "rgba(26,42,87,0.10)", borderStrong: "rgba(26,42,87,0.13)",
      surface: "#ffffff", surfaceAlt: "rgba(248,249,250,0.95)",
      panelBg: null, pageBg: "transparent", mutedAccent: "#c7ceda",
      UP: "#18786e", WARN: "#8a680f", DOWN: "#b42318", UNKNOWN: "#5a6b88",
      dotGlow: (c) => `0 0 0 3px ${c}22`,
      STATE_META: {
        UP:      { color: "#18786e", bg: "rgba(42,157,143,0.14)",  label: "UP" },
        WARN:    { color: "#8a680f", bg: "rgba(233,196,106,0.20)", label: "WARNING" },
        DOWN:    { color: "#b42318", bg: "rgba(231,111,81,0.14)",  label: "DOWN" },
        UNKNOWN: { color: "#5a6b88", bg: "rgba(26,42,87,0.06)",    label: "NO DATA" },
      },
      CARD_TONE: {
        UP:      { wash: "rgba(42,157,143,0.06)",  border: "rgba(24,120,110,0.30)" },
        WARN:    { wash: "rgba(233,196,106,0.12)", border: "rgba(138,104,15,0.32)" },
        DOWN:    { wash: "rgba(231,111,81,0.08)",  border: "rgba(180,35,24,0.32)" },
        UNKNOWN: { wash: "rgba(26,42,87,0.035)",   border: "rgba(26,42,87,0.16)"  },
      },
    };
  }
  return {
    dark: false,
    navy: "#214c9a", navyMid: "#3f6fc9", teal: "#0f9f8f", coral: "#f26b4f",
    text: "#10233f", textSoft: "#405878", muted: "#687a95",
    border: "rgba(33,76,154,0.12)", borderStrong: "rgba(33,76,154,0.18)",
    surface: "#ffffff", surfaceAlt: "#f7faff",
    panelBg: "rgba(255,255,255,0.94)",
    pageBg: "linear-gradient(135deg, #f6fbff 0%, #eef6ff 45%, #f8fbff 100%)",
    mutedAccent: "#d9e4f4",
    UP: "#0b8f70", WARN: "#b77905", DOWN: "#d92d20", UNKNOWN: "#667085",
    dotGlow: (c) => `0 0 0 4px ${c}20, 0 8px 18px -10px ${c}`,
    STATE_META: {
      UP:      { color: "#0b8f70", bg: "rgba(15,159,143,0.13)", label: "UP" },
      WARN:    { color: "#b77905", bg: "rgba(247,181,0,0.16)",  label: "WARNING" },
      DOWN:    { color: "#d92d20", bg: "rgba(217,45,32,0.13)",  label: "DOWN" },
      UNKNOWN: { color: "#667085", bg: "rgba(102,112,133,0.10)", label: "NO DATA" },
    },
    CARD_TONE: {
      UP:      { wash: "rgba(15,159,143,0.08)", border: "rgba(15,159,143,0.28)" },
      WARN:    { wash: "rgba(247,181,0,0.10)",  border: "rgba(183,121,5,0.30)" },
      DOWN:    { wash: "rgba(217,45,32,0.08)",  border: "rgba(217,45,32,0.30)" },
      UNKNOWN: { wash: "rgba(102,112,133,0.05)", border: "rgba(102,112,133,0.20)" },
    },
  };
}

const LIGHT = buildPalette(false);
const WALL = buildPalette(true);

const stateColor = (state, pal) => (pal.STATE_META[state] || pal.STATE_META.UNKNOWN).color;
const STATE_ICON = { UP: CheckCircle, WARN: AlertTriangle, DOWN: XCircle, UNKNOWN: AlertCircle };
const severityColor = (sev, pal) =>
  sev >= 4 ? pal.DOWN : sev === 3 ? pal.coral : sev === 2 ? pal.WARN : pal.navyMid;

const shortLabel = (s = "") => s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();

/* Warna khas per site (dipakai di chip filter & kartu ringkasan Perangkat),
   biar tiap lokasi gampang dibedain sekilas. Dulu pakai hash nama site -> palet,
   tapi itu bisa nabrak (dua site beda nama kebetulan hash-nya sama, jadi
   warnanya sama padahal harusnya beda). Sekarang tiap site baru yang ketemu
   dijatah warna berikutnya dari palet secara berurutan (first-seen), dicache
   per site — jadi selama jumlah site <= panjang palet, gak ada dua site yang
   kebagian warna sama. */
const SITE_PALETTE = [
  "#2563eb", "#7c3aed", "#0d9488", "#c2410c", "#be185d",
  "#4f46e5", "#0891b2", "#a16207", "#65a30d", "#9333ea",
];
const _siteColorAssigned = new Map();
function siteColor(site) {
  const key = String(site || "");
  let color = _siteColorAssigned.get(key);
  if (!color) {
    color = SITE_PALETTE[_siteColorAssigned.size % SITE_PALETTE.length];
    _siteColorAssigned.set(key, color);
  }
  return color;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
  "Agustus", "September", "Oktober", "November", "Desember"];
const fmtTanggal = (d) => `${HARI[d.day()]}, ${d.date()} ${BULAN[d.month()]} ${d.year()}`;
const fmtSince = (s) => {
  if (!s) return "";
  const str = String(s).trim();
  return str.length >= 16 ? str.slice(11, 16) : str;
};

/* Tebak jenis perangkat dari nama / comment Netwatch */
const DEVICE_TYPES = {
  isp:    { icon: Globe05,   label: "ISP / Internet" },
  ap:     { icon: Wifi,      label: "Access Point" },
  switch: { icon: Dataflow04, label: "Switch" },
  router: { icon: CpuChip01, label: "Router" },
  server: { icon: Server05,  label: "Server / CCTV" },
  device: { icon: Box,       label: "Perangkat" },
};

/* Override manual: taruh #ap / #switch / #router / #cctv / #server / #isp di
   comment (atau name) entry Netwatch untuk memaksa jenis + icon-nya. */
const TYPE_TAGS = {
  isp: "isp", internet: "isp", wan: "isp",
  ap: "ap", accesspoint: "ap", wifi: "ap",
  sw: "switch", switch: "switch",
  rtr: "router", router: "router", mikrotik: "router",
  cctv: "server", server: "server", nvr: "server", dvr: "server",
  device: "device", lainnya: "device",
};

function deviceType(d) {
  const raw = `${d.name || ""} ${d.comment || ""} ${d.dhcp_name || ""}`.toLowerCase();

  // 1) Override manual eksplisit: #ap / #switch / #router / #cctv ...
  const tag = raw.match(/#([a-z]+)/);
  if (tag && TYPE_TAGS[tag[1]]) return TYPE_TAGS[tag[1]];

  // 2) pisah separator jadi spasi, rapikan
  const s = ` ${raw.replace(/[_\-.#/]+/g, " ").replace(/\s+/g, " ").trim()} `;

  // ISP / uplink internet — nama umum & brand penyedia layanan internet
  if (
    /\b(isp|internet|wan)\b/.test(s) ||
    /\b(indihome|biznet|iconnet|icon ?\+|firstmedia|myrepublic|moratelindo|lintasarta|oxygen|cbn|mnc ?play|iforte|telkom(sel)?|xl ?axiata)\b/.test(s)
  ) return "isp";

  // ACCESS POINT — toleran salah ketik ("acces/accesss point", "accesspoint"),
  // istilah wifi umum, & kode "AP01 / AP-1 / AP"
  if (
    /acce?s{1,4} ?point/.test(s) ||
    /\bap ?\d/.test(s) || /\bap\b/.test(s) ||
    /\b(wifi|wireless|hotspot|unifi|omada|ubiquiti|wap|hap|eap\d*|cpe|airmax|nano ?station)\b/.test(s) ||
    /\bcap ac\b/.test(s)
  ) return "ap";

  // SWITCH — "switch", salah ketik "swtch/swich", kode "SW / SW-1 / SW01"
  if (
    /\bsw[a-z]*t?ch(es)?\b/.test(s) ||
    /\bsw ?\d/.test(s) || /\bsw\b/.test(s) ||
    /\b(catalyst|dgs\d|des\d|gs\d)\b/.test(s) || /\bhp switch\b/.test(s)
  ) return "switch";

  // ROUTER / gateway
  if (/\b(router|rtr|ccr|hex|gateway|gw|olt|onu|modem|mikrotik)\b/.test(s) || /\brb ?\d/.test(s)) return "router";

  // SERVER / CCTV
  if (/\b(server|srv|nas|dvr|nvr|cctv|camera|kamera|ipcam|hikvision|dahua)\b/.test(s)) return "server";

  return "device";
}

function exportRowsToExcel(rows, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const colWidths = Object.keys(rows[0] || {}).map((k) => ({
    wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2,
  }));
  ws["!cols"] = colWidths;
  XLSX.writeFile(wb, fileName);
}

function fmtAge(sec) {
  if (sec == null) return "-";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  return `${Math.floor(h / 24)}h ${h % 24}j`;
}

function useBreakpoint() {
  const get = () => (typeof window === "undefined" ? 1200 : window.innerWidth);
  const [w, setW] = useState(get);
  useEffect(() => {
    const h = () => setW(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: w < 720, isNarrow: w < 1080 };
}

/* Hitung jumlah kolom grid supaya semua kartu muat tanpa scroll (dipakai di
   fullscreen). Beda dari scale-transform: hasilnya bilangan bulat kolom, jadi
   kartu tetap tajam & ukurannya stabil — cuma dihitung ulang kalau ukuran
   layar berubah atau jumlah datanya berubah, bukan tiap polling 15 detik.
   Kalau datanya beneran kebanyakan sampai nggak ada susunan kolom yang muat,
   `fits` jadi false supaya pemanggil boleh fallback ke scroll (jangan sampai
   ada perangkat down yang malah ke-hidden). */
function useGridFit(active, calc, deps) {
  const ref = useRef(null);
  const [state, setState] = useState({ cols: 1, fits: true });

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const next = calc(w, h);
      setState((prev) => (prev.cols === next.cols && prev.fits === next.fits ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return { ref, ...state };
}

/* ─── Sparkline (tren latency ~2 jam, digambar langsung sebagai SVG) ─── */
const Sparkline = ({ points = [], color, w = 108, h = 26 }) => {
  const vals = points.map((p) => (p == null ? null : Number(p))).filter((v) => v != null && !Number.isNaN(v));
  if (vals.length < 2) return null;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const stepX = w / (points.length - 1);
  let d = "";
  points.forEach((p, i) => {
    if (p == null || Number.isNaN(Number(p))) return;
    const x = i * stepX;
    const y = h - ((Number(p) - min) / span) * (h - 3) - 1.5;
    d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const last = vals[vals.length - 1];
  const first = vals[0];
  const trendUp = last > first * 1.15;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      </svg>
      {trendUp && <span style={{ fontSize: 9, fontWeight: 800, color }}>▲</span>}
    </span>
  );
};

/* ─── Primitives ─── */
const StatePill = ({ state, size = "sm", pal }) => {
  const m = pal.STATE_META[state] || pal.STATE_META.UNKNOWN;
  const Icon = STATE_ICON[state] || STATE_ICON.UNKNOWN;
  const pad = size === "sm" ? "3px 8px 3px 6px" : "4px 10px 4px 8px";
  const fs = size === "sm" ? 10 : 11;
  const isz = size === "sm" ? 11 : 12;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: fs, fontWeight: 800, letterSpacing: "0.05em", color: m.color,
      background: m.bg, borderRadius: 6, padding: pad, flexShrink: 0, whiteSpace: "nowrap",
    }}><Icon width={isz} height={isz} />{m.label}</span>
  );
};

const Metric = ({ label, value, tone, pal }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: pal.muted, textTransform: "uppercase" }}>{label}</span>
    <span style={{ fontSize: 11.5, fontWeight: 700, color: tone || pal.text, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
  </div>
);

/* ─── Counter tile ─── */
const Counter = ({ label, value, color, muted, fs, pal, Icon }) => {
  const iconColor = muted ? pal.muted : color;
  return (
    <div className="noc-counter" style={{
      background: pal.surface, border: `1px solid ${pal.borderStrong}`,
      borderRadius: 12, padding: fs ? "14px 18px" : "10px 14px",
      display: "flex", alignItems: "center", gap: fs ? 14 : 10,
    }}>
      {Icon && (
        <span style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          width: fs ? 44 : 34, height: fs ? 44 : 34, borderRadius: 10,
          background: `${iconColor}1c`, color: iconColor,
        }}>
          <Icon width={fs ? 22 : 17} height={fs ? 22 : 17} />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fs ? 11.5 : 10, fontWeight: 700, letterSpacing: "0.09em", color: pal.muted, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: fs ? 32 : 24, fontWeight: 800, color: muted ? pal.textSoft : color, lineHeight: 1.15, fontFamily: "'IBM Plex Mono', monospace" }}>
          <span key={String(value)} className="noc-pop" style={{ display: "inline-block" }}>{value}</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Section header ─── */
const SectionHead = ({ title, sub, right, fs, pal, stripe }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    marginBottom: fs ? 16 : 14, paddingBottom: fs ? 10 : 0,
    borderBottom: fs && stripe ? `2px solid ${stripe}55` : undefined,
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      {fs && stripe && <span style={{ width: 7, height: 7, borderRadius: "50%", background: stripe, flexShrink: 0 }} />}
      <h3 style={{
        margin: 0, fontSize: fs ? 15 : 13, fontWeight: 800, color: pal.text,
        letterSpacing: fs ? "0.06em" : "-0.01em", textTransform: fs ? "uppercase" : "none",
      }}>{title}</h3>
      {sub != null && <span style={{ fontSize: fs ? 12 : 11, color: pal.muted }}>{sub}</span>}
    </div>
    {right}
  </div>
);

/* ─── Site card ─── */
const SiteCard = ({ s, idx = 0, pal, trend = [] }) => {
  const meta = pal.STATE_META[s.state] || pal.STATE_META.UNKNOWN;
  const StateIcon = STATE_ICON[s.state] || STATE_ICON.UNKNOWN;
  const sc = siteColor(s.label);
  return (
    <div className={`noc-card${s.state === "DOWN" ? " noc-alarm" : ""}`} style={{
      background: "transparent",
      border: `1.5px solid ${sc}66`,
      borderRadius: 9,
      alignSelf: "stretch",
      padding: "8px 9px", display: "flex", flexDirection: "column", gap: 7,
      animationDelay: `${Math.min(idx, 12) * 28}ms`, minHeight: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            width: 19, height: 19, borderRadius: 6, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${sc}1c`,
          }}>
            <StateIcon width={11} height={11} color={meta.color} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: pal.text, overflowWrap: "anywhere" }}>
            {shortLabel(s.label)}
          </span>
        </span>
        <StatePill state={s.state} pal={pal} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
        background: pal.surfaceAlt, border: `1px solid ${pal.border}`, borderRadius: 7, padding: "5px 3px",
      }}>
        <div style={{ borderRight: `1px dashed ${pal.border}`, padding: "0 6px" }}>
          <Metric label="Latency" value={s.latency_ms == null ? "–" : `${s.latency_ms}ms`} pal={pal} />
        </div>
        <div style={{ borderRight: `1px dashed ${pal.border}`, padding: "0 6px" }}>
          <Metric label="Loss" value={s.loss_pct == null ? "–" : `${s.loss_pct}%`} tone={(s.loss_pct || 0) >= 2 ? pal.DOWN : undefined} pal={pal} />
        </div>
        <div style={{ padding: "0 6px" }}>
          <Metric label="Utilisasi" value={s.util_pct == null ? "–" : `${s.util_pct}%`} tone={(s.util_pct || 0) >= 85 ? pal.WARN : undefined} pal={pal} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10.5, color: pal.muted }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>↓ {s.in_mbps == null ? "–" : `${s.in_mbps}M`}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>↑ {s.out_mbps == null ? "–" : `${s.out_mbps}M`}</span>
        <span title="Tren latency ±2 jam" style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <Sparkline points={trend} color={meta.color} />
        </span>
      </div>
      {(s.vpn_measured || s.is_standby) && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: pal.muted, marginTop: -2, justifyContent: "flex-end" }}>
          {s.vpn_measured && <span style={{ border: `1px solid ${pal.border}`, borderRadius: 4, padding: "0 4px" }}>VPN</span>}
          {s.is_standby && <span style={{ color: pal.UP, border: `1px solid ${pal.UP}55`, borderRadius: 4, padding: "0 4px" }}>CADANGAN</span>}
        </div>
      )}
    </div>
  );
};

/* ─── Device card (Netwatch) ─── */
const deviceKey = (d) => `device:${d.router_name || "-"}:${d.host || d.name || "-"}`;

const DeviceCard = ({ d, idx = 0, compact = false, pal, showSite = false, trend = [], accent }) => {
  const tp = DEVICE_TYPES[deviceType(d)] || DEVICE_TYPES.device;
  const Icon = tp.icon;
  const c = stateColor(d.state, pal);
  const lat = d.latency_ms;
  const wallCompact = compact && pal === WALL;
  const showHost = !compact && d.dhcp_name && d.dhcp_name.trim() && d.dhcp_name.trim() !== (d.name || "").trim();
  const showQos = lat != null || (d.loss_pct != null && d.loss_pct > 0);
  const sc = accent || siteColor(d.router_name || "Lainnya");

  return (
    <div className={`noc-card${d.state === "DOWN" ? " noc-alarm" : ""}`} style={{
      display: "flex", alignItems: "flex-start", gap: wallCompact ? 10 : compact ? 8 : 10,
      padding: wallCompact ? "8px 9px" : compact ? "6px 8px" : "8px 9px",
      background: "transparent",
      border: `1.5px solid ${sc}66`,
      borderRadius: 8,
      alignSelf: "stretch",
      minWidth: 0, minHeight: 0, overflow: "hidden",
      flexShrink: 0,
      animationDelay: `${Math.min(idx, 16) * 22}ms`,
    }}>
      <span style={{
        width: wallCompact ? 30 : compact ? 24 : 28,
        height: wallCompact ? 30 : compact ? 24 : 28,
        borderRadius: 7,
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", color: c,
        background: `${sc}1c`,
      }}>
        <Icon width={wallCompact ? 17 : compact ? 14 : 16} height={wallCompact ? 17 : compact ? 14 : 16} />
      </span>

      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: wallCompact ? 13 : compact ? 11.5 : 12.5, fontWeight: 750, color: pal.text, overflowWrap: "anywhere", lineHeight: 1.25 }}>
            {d.name}
          </span>
          <StatePill state={d.state} pal={pal} />
        </div>

        <span style={{ fontSize: wallCompact ? 11 : 10, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace", overflowWrap: "anywhere", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{showSite ? `${shortLabel(d.router_name || "Lainnya")} · ${tp.label}` : `${tp.label} · ${d.host || "-"}`}</span>
          {d.state === "DOWN" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: pal.DOWN, fontWeight: 800 }}>
              <AlertTriangle width={10} height={10} /> sejak {fmtSince(d.since) || "terdeteksi"}
            </span>
          )}
          {showQos && lat != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: lat >= 100 ? pal.WARN : pal.textSoft, fontWeight: 700 }}>
              <Clock width={10} height={10} /> {lat < 1 ? "<1" : Math.round(lat)}ms
            </span>
          )}
          {showQos && d.loss_pct != null && d.loss_pct > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: pal.DOWN, fontWeight: 700 }}>
              <XClose width={10} height={10} /> {d.loss_pct}%
            </span>
          )}
        </span>

        {showHost && (
          <span style={{ fontSize: 10, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace", overflowWrap: "anywhere" }}>
            hostname: {d.dhcp_name}
          </span>
        )}

        {d.state !== "DOWN" && trend.filter((v) => v != null).length >= 2 && (
          <span title="Tren latency ±2 jam" style={{ marginTop: 2 }}>
            <Sparkline points={trend} color={c} w={compact ? 76 : 92} h={18} />
          </span>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════ */
export default function NocView() {
  const { isMobile, isNarrow } = useBreakpoint();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [lastOk, setLastOk] = useState(null);
  const rootRef = useRef(null);
  // Mode "Layar Penuh" (wallboard) dihapus — NOC selalu tampil mode normal.
  const isFs = false;
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(() => dayjs());
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyErr, setHistoryErr] = useState("");
  const [histQuery, setHistQuery] = useState("");
  const [histKind, setHistKind] = useState("ALL");
  const [histStatus, setHistStatus] = useState("ALL");
  const [recent, setRecent] = useState([]);
  const [recentBlackouts, setRecentBlackouts] = useState([]);
  const [histBlackouts, setHistBlackouts] = useState([]);
  const [statBlackouts, setStatBlackouts] = useState([]);
  const [trend, setTrend] = useState({});
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState("");
  const [deviceStatusFilter, setDeviceStatusFilter] = useState("ALL");
  const [deviceSiteFilter, setDeviceSiteFilter] = useState("ALL");

  const pal = isFs ? WALL : LIGHT;

  useEffect(() => {
    const t = setInterval(() => setClock(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/noc/live`, { timeout: 20000 });
      setData(data);
      setError("");
      setLastOk(dayjs());
    } catch (err) {
      setError(err?.message || "Gagal memuat data NOC");
    } finally {
      setLoading(false);
    }
    // Insiden 24 jam terakhir (biar yang sudah pulih pun masih kelihatan)
    try {
      const { data } = await axios.get(`${API_BASE}/api/noc/history`, { params: { days: 1 }, timeout: 20000 });
      setRecent(data.events || []);
      setRecentBlackouts(data.blackouts || []);
    } catch { /* diamkan — panel live tetap jalan */ }
    try {
      const { data } = await axios.get(`${API_BASE}/api/noc/trend`, { params: { minutes: 120 }, timeout: 20000 });
      setTrend(data.series || {});
    } catch { /* sparkline opsional */ }
  };

  const loadStats = async () => {
    setStats(null);
    setStatsErr("");
    try {
      const { data } = await axios.get(`${API_BASE}/api/noc/stats`, { params: { kind: "site", days: 7 }, timeout: 20000 });
      setStats(data.stats || []);
      setStatBlackouts(data.blackouts || []);
    } catch (err) {
      setStatsErr(err?.response?.data?.detail || err?.message || "Gagal memuat statistik");
    }
  };

  const loadHistory = async () => {
    setHistory(null);
    setHistoryErr("");
    try {
      const { data } = await axios.get(`${API_BASE}/api/noc/history`, { params: { days: 7 }, timeout: 20000 });
      setHistory(data.events || []);
      setHistBlackouts(data.blackouts || []);
    } catch (err) {
      setHistoryErr(err?.response?.data?.detail || err?.message || "Gagal memuat riwayat");
    }
  };

  useEffect(() => {
    if (showHistory) { loadHistory(); setHistQuery(""); setHistKind("ALL"); setHistStatus("ALL"); }
  }, [showHistory]);

  useEffect(() => {
    if (showStats) loadStats();
  }, [showStats]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const counts = data?.counts || { total: 0, up: 0, warn: 0, down: 0, unknown: 0 };
  const sites = data?.sites || [];
  const problems = data?.problems || [];
  const devices = data?.devices || [];
  const dc = data?.device_counts || { total: 0, up: 0, down: 0, unknown: 0 };
  const clients = data?.clients || {};
  const clientsTotal = data?.clients_total ?? 0;
  const allClear = !error && counts.down === 0 && counts.warn === 0 && problems.length === 0 && dc.down === 0;
  const overall = error ? pal.DOWN : allClear ? pal.UP : pal.WARN;
  const pad = isFs ? 22 : 18;

  // Insiden = kejadian down 24 jam terakhir dari log (site + perangkat),
  // termasuk yang sudah pulih — biar matiin-idupin-lagi tetap kelihatan.
  // Problem Zabbix sengaja TIDAK dimasukkan di sini (cuma di counter).
  const hhmm = (s) => (s && s.length >= 16 ? s.slice(11, 16) : s || "");
  const incidentSite = (h) => {
    const keyParts = String(h.key || "").split(":");
    const fromDeviceKey = keyParts[0] === "device" ? keyParts[1] : "";
    const raw = h.router_name || h.site || h.router || fromDeviceKey || (h.kind === "site" ? h.name : "") || "";
    const clean = shortLabel(raw).trim();
    if (clean) return clean;

    const text = String(h.name || "").toLowerCase();
    if (text.includes("jatake")) return "Jatake";
    if (text.includes("rbk")) return "RBK";
    return "Lainnya";
  };
  // Yang masih berlangsung (belum pulih) ditaro paling atas dulu — itu yang paling
  // butuh perhatian; baru sisanya diurutkan kronologis (terbaru di atas).
  const byOngoingThenTime = (a, b) => {
    if (!!a.ongoing !== !!b.ongoing) return a.ongoing ? -1 : 1;
    return String(b.when).localeCompare(String(a.when));
  };

  // Log kronologis polos: satu baris per kejadian, aktivitas terbaru di atas.
  const incidents = useMemo(() => {
    return (recent || [])
      .map((h, i) => {
        const site = incidentSite(h);
        const jenis = h.kind === "site" ? "Koneksi site" : "Perangkat";
        const downAt = hhmm(h.down_at);
        const upAt = h.up_at ? hhmm(h.up_at) : null;
        const dur = fmtAge(h.duration_seconds);
        const desc = h.ongoing
          ? `${jenis} di ${site} tidak merespons sejak pukul ${downAt} — belum pulih (${dur} berjalan).`
          : `${jenis} di ${site} terputus pukul ${downAt}, kembali normal pukul ${upAt} — total ${dur} tidak dapat diakses.`;
        return {
          id: `h-${i}-${h.name}-${h.down_at}`,
          site, kindLabel: jenis, title: shortLabel(h.name),
          downAt, upAt, desc,
          when: h.up_at || h.down_at || "",
          right: dur,
          ongoing: h.ongoing,
        };
      })
      .sort(byOngoingThenTime);
  }, [recent, pal]);
  const incOngoing = incidents.filter((x) => x.ongoing).length;
  const incRecovered = incidents.length - incOngoing;

  // Blackout = periode pemantauan mati (server dimatikan / backend down). Status
  // perangkat selama rentang ini memang tidak tercatat — ditandai eksplisit biar
  // nggak disangka "semua normal".
  const fmtBlackout = (b) => {
    const s = hhmm(b.started_at), e = hhmm(b.ended_at);
    const sameDay = String(b.started_at).slice(0, 10) === String(b.ended_at).slice(0, 10);
    const eLabel = sameDay ? e : `${e} (${String(b.ended_at).slice(0, 10)})`;
    return {
      id: `bo-${b.started_at}`,
      blackout: true,
      when: b.ended_at || b.started_at,
      from: s, to: eLabel,
      dur: fmtAge(b.seconds),
      desc: `Pemantauan berhenti pukul ${s}–${eLabel} (server mati). Perangkat yang masih bermasalah setelah jeda tetap dihitung terganggu sejak sebelum jeda; hanya kejadian singkat yang murni di dalam jeda ini yang mungkin tidak tercatat.`,
    };
  };
  const logRows = useMemo(() => {
    const bos = (recentBlackouts || []).map(fmtBlackout);
    return [...incidents, ...bos].sort(byOngoingThenTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, recentBlackouts]);

  const exportIncidents = () => {
    const rows = incidents.map((x) => ({
      Waktu: x.upAt || x.downAt,
      Jenis: x.kindLabel,
      Nama: x.title,
      Site: x.site,
      "Mati Jam": x.downAt,
      "Nyala Jam": x.upAt || "-",
      Durasi: x.right,
      Status: x.ongoing ? "BERLANGSUNG" : "SELESAI",
      Uraian: x.desc,
    }));
    exportRowsToExcel(rows, "Log Insiden", `Log_Insiden_NOC_${dayjs().format("YYYYMMDD_HHmm")}.xlsx`);
  };

  const exportHistory = () => {
    const rows = (history || []).map((h) => ({
      Jenis: h.kind === "site" ? "Site" : "Perangkat",
      Nama: shortLabel(h.name),
      "Mati Jam": h.down_at,
      "Nyala Jam": h.up_at || (h.ongoing ? "Masih down" : "-"),
      Durasi: fmtAge(h.duration_seconds),
      Status: h.ongoing ? "BERLANGSUNG" : "SELESAI",
    }));
    exportRowsToExcel(rows, "Riwayat Downtime", `Riwayat_Downtime_NOC_${dayjs().format("YYYYMMDD_HHmm")}.xlsx`);
  };

  // Kelompokkan perangkat per site (nama router MikroTik-nya)
  const deviceGroups = useMemo(() => {
    const g = {};
    for (const d of devices) {
      const k = d.router_name || "Lainnya";
      (g[k] = g[k] || []).push(d);
    }
    return Object.entries(g)
      .map(([site, list]) => ({
        site,
        list,
        down: list.filter((x) => x.state === "DOWN").length,
        up: list.filter((x) => x.state === "UP").length,
      }))
      .sort((a, b) => b.down - a.down || a.site.localeCompare(b.site));
  }, [devices]);
  const deviceSiteOptions = deviceGroups.map((g) => g.site);
  const filteredDeviceGroups = useMemo(() => {
    return deviceGroups
      .filter((grp) => deviceSiteFilter === "ALL" || grp.site === deviceSiteFilter)
      .map((grp) => {
        const list = grp.list.filter((d) => deviceStatusFilter === "ALL" || d.state === deviceStatusFilter);
        return {
          ...grp,
          list,
          down: list.filter((x) => x.state === "DOWN").length,
          up: list.filter((x) => x.state === "UP").length,
          unknown: list.filter((x) => x.state === "UNKNOWN").length,
        };
      })
      .filter((grp) => grp.list.length > 0);
  }, [deviceGroups, deviceSiteFilter, deviceStatusFilter]);

  // Fullscreen: hitung kolom biar Site & Perangkat muat penuh tanpa scroll
  const SITE_MIN_W = 200, SITE_MIN_H = 128, SITE_GAP = 10;
  const sitesFit = useGridFit(isFs, (w, h) => {
    const n = sites.length || 1;
    const maxByWidth = Math.max(1, Math.floor((w + SITE_GAP) / (SITE_MIN_W + SITE_GAP)));
    for (let cols = 1; cols <= maxByWidth; cols++) {
      const rows = Math.ceil(n / cols);
      const neededH = rows * SITE_MIN_H + (rows - 1) * SITE_GAP;
      if (neededH <= h) return { cols, fits: true };
    }
    return { cols: maxByWidth, fits: false };
  }, [sites.length]);

  const rootStyle = isFs
    ? {
        position: "relative",
        display: "flex", flexDirection: "column", gap: 14, width: "100%",
        background: pal.pageBg, padding: "20px 24px 14px", height: "100vh",
        overflow: "hidden", boxSizing: "border-box",
        color: pal.text,
      }
    : {
        position: "relative",
        gap: 14, gridTemplateColumns: "minmax(0, 1fr)", width: "100%",
        background: "transparent", padding: 0, alignContent: "start",
      };

  const btnStyle = {
    background: isFs ? "rgba(255,255,255,0.86)" : pal.surface, color: pal.navy,
    border: `1px solid ${pal.borderStrong}`,
    borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap",
    boxShadow: isFs ? "0 10px 24px -18px rgba(33,76,154,0.70)" : undefined,
  };
  const tintBtnStyle = (color) => ({
    ...btnStyle,
    background: `${color}12`, color,
    border: `1px solid ${color}55`,
  });
  const EXCEL_GREEN = "#1d6f42";
  const RIWAYAT_BLUE = "#2563eb";
  const KEANDALAN_VIOLET = "#7c3aed";
  const excelBtnStyle = tintBtnStyle(EXCEL_GREEN);
  const riwayatBtnStyle = tintBtnStyle(RIWAYAT_BLUE);
  const keandalanBtnStyle = tintBtnStyle(KEANDALAN_VIOLET);
  const filterChip = (active, color = pal.navy) => ({
    border: `1px solid ${active ? color : pal.borderStrong}`,
    background: active ? `${color}14` : pal.surfaceAlt,
    color: active ? color : pal.textSoft,
    borderRadius: 8,
    padding: isFs ? "6px 10px" : "5px 9px",
    fontSize: isFs ? 11 : 10.5,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  });
  // Chip site: selalu diwarnai sesuai warna khas site-nya (bukan cuma pas aktif),
  // biar tiap lokasi kebeda dari sekilas walau belum dipilih.
  const siteChip = (active, color) => ({
    border: `1px solid ${active ? color : `${color}55`}`,
    background: active ? `${color}22` : `${color}0f`,
    color, borderRadius: 8,
    padding: isFs ? "6px 10px" : "5px 9px",
    fontSize: isFs ? 11 : 10.5,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  });
  const deviceStatusOptions = [
    ["ALL", "Semua", pal.navy],
    ["DOWN", "Down", pal.DOWN],
    ["UP", "Up", pal.UP],
  ];

  return (
    <div ref={rootRef} className={`dashboard-content noc-wall${isFs ? " noc-fs" : ""}`} style={rootStyle}>
      {loading && !data && <div className="noc-loadbar"><i /></div>}
      {/* Header */}
      <div className="dashboard-panel noc-head" style={{
        padding: isFs ? "14px 22px" : "14px 18px", display: "flex",
        justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span style={{
            width: isFs ? 13 : 10, height: isFs ? 13 : 10, borderRadius: "50%", flexShrink: 0,
            background: overall, boxShadow: pal.dotGlow(overall),
            animation: "noc-pulse 2s infinite",
          }} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: isFs ? 22 : 16, fontWeight: 800,
              letterSpacing: isFs ? "0.1em" : "0.02em", color: pal.text,
              textTransform: isFs ? "uppercase" : "none",
            }}>NOC Monitoring</h2>
            <div style={{ fontSize: isFs ? 12 : 11.5, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
              {error
                ? <span style={{ color: pal.DOWN }}>Koneksi backend terputus · data terakhir {lastOk ? lastOk.format("HH:mm:ss") : "-"}</span>
                : <>Network Operations Center · update {data?.generated_at?.slice(11) || "—"}</>}
            </div>
          </div>
        </div>


        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right", lineHeight: 1.05 }}>
            <div style={{ fontSize: isFs ? 32 : 15, fontWeight: 800, color: pal.text, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.02em" }}>
              {clock.format("HH:mm:ss")}
            </div>
            <div style={{ fontSize: isFs ? 12 : 10.5, color: pal.muted, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
              <Calendar width={isFs ? 13 : 11} height={isFs ? 13 : 11} />
              {fmtTanggal(clock)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!isFs && (
              <button onClick={() => setShowStats(true)} style={{ ...keandalanBtnStyle, display: "inline-flex", alignItems: "center", gap: 6 }} title="Uptime % & MTTR 7 hari">
                <BarChartSquare02 width={14} height={14} /> Keandalan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Counters */}
      <div style={{
        display: "grid", gap: isFs ? 10 : 10, flexShrink: 0,
        gridTemplateColumns: (isMobile && !isFs) ? "repeat(2, 1fr)" : "repeat(6, 1fr)",
      }}>
        <Counter label="Total Site" value={counts.total} color={pal.navy} muted fs={isFs} pal={pal} Icon={MarkerPin05} />
        <Counter label="Site Up" value={counts.up} color={pal.UP} fs={isFs} pal={pal} Icon={CheckCircle} />
        <Counter label="Warning" value={counts.warn} color={pal.WARN} muted={counts.warn === 0} fs={isFs} pal={pal} Icon={AlertTriangle} />
        <Counter label="Site Down" value={counts.down} color={pal.DOWN} muted={counts.down === 0} fs={isFs} pal={pal} Icon={XCircle} />
        <Counter label="Problem Aktif" value={data?.problem_count ?? 0} color={pal.DOWN} muted={problems.length === 0} fs={isFs} pal={pal} Icon={AlertCircle} />
        <Counter label="Perangkat Up" value={`${dc.up}/${dc.total}`} color={dc.down ? pal.DOWN : pal.UP} muted={dc.total === 0} fs={isFs} pal={pal} Icon={Server04} />
      </div>

      {/* ── Panel: Active Problems & Insiden ── */}
      {(() => { const panelProblems = (
        <div className="dashboard-panel" style={{ padding: isFs ? "18px 20px" : pad, display: "flex", flexDirection: "column", minHeight: 0, maxHeight: isFs ? undefined : 380, overflow: "hidden" }}>
          <SectionHead
            title="Log Insiden" fs={isFs} pal={pal} stripe={pal.coral}
            sub={incidents.length
              ? `24 jam terakhir · ${incidents.length} kejadian · ${incOngoing} berlangsung${incRecovered ? ` · ${incRecovered} selesai` : ""}`
              : "24 jam terakhir"}
            right={(
              <div style={{ display: "flex", gap: 6 }}>
                {!isFs && (
                  <button onClick={() => setShowHistory(true)} style={{ ...riwayatBtnStyle, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", fontSize: 11 }} title="Lihat detail riwayat insiden 7 hari terakhir">
                    <Clipboard width={13} height={13} /> Detail Riwayat
                  </button>
                )}
                {incidents.length > 0 && (
                  <button onClick={exportIncidents} style={{ ...excelBtnStyle, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", fontSize: 11 }} title="Export log insiden ke Excel">
                    <Download04 width={13} height={13} /> Excel
                  </button>
                )}
              </div>
            )}
          />
          {logRows.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: pal.UP, minHeight: isFs ? 92 : 120 }}>
              <span style={{ width: isFs ? 54 : 44, height: isFs ? 54 : 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: pal.STATE_META.UP.bg }}>
                <CheckCircle width={isFs ? 28 : 24} height={isFs ? 28 : 24} />
              </span>
              <span style={{ fontSize: isFs ? 16 : 13.5, fontWeight: 700 }}>Tidak ada insiden</span>
              <span style={{ fontSize: isFs ? 12 : 11, color: pal.muted, fontWeight: 500 }}>Tidak ada site / perangkat down dalam 24 jam terakhir</span>
            </div>
          ) : (
            <div className="noc-scroll" style={{
              flex: 1, minHeight: 0, overflowY: "auto", scrollPaddingTop: 26,
            }}>
              {/* header kolom */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "0 2px 6px", position: "sticky", top: 0, zIndex: 2,
                background: isFs ? WALL.panelBg : LIGHT.surface,
                borderBottom: `1px solid ${pal.borderStrong}`,
                fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: pal.muted, textTransform: "uppercase",
              }}>
                <span style={{ width: isFs ? 78 : 62 }}>Waktu</span>
                <span style={{ flex: 1 }}>Uraian Kejadian</span>
                <span>Status</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {logRows.map((x, i) => x.blackout ? (
                  <div key={x.id} className="noc-logrow" style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: isFs ? "9px 4px" : "8px 4px",
                    borderBottom: i === logRows.length - 1 ? "none" : `1px solid ${pal.border}`,
                    background: `${pal.WARN}0d`,
                  }}>
                    <span style={{
                      width: isFs ? 78 : 62, flexShrink: 0, marginTop: 1,
                      fontSize: isFs ? 12.5 : 10.5, fontWeight: 700, color: pal.WARN,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>{x.from}</span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: isFs ? 13 : 11.5, fontWeight: 800, color: pal.WARN, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <AlertTriangle width={12} height={12} /> Pemantauan berhenti
                        <span style={{ fontSize: isFs ? 11 : 9.5, fontWeight: 700, color: pal.muted }}>· {x.dur}</span>
                      </span>
                      <span style={{ fontSize: isFs ? 11.5 : 10, color: pal.textSoft, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                        {x.desc}
                      </span>
                    </span>
                    <span style={{
                      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.04em",
                      padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 1,
                      color: pal.WARN, background: `${pal.WARN}1f`,
                    }}>BLACKOUT</span>
                  </div>
                ) : (
                  <div key={x.id} className="noc-logrow" style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: isFs ? "9px 2px" : "8px 2px",
                    borderBottom: i === logRows.length - 1 ? "none" : `1px solid ${pal.border}`,
                    animationDelay: `${Math.min(i, 16) * 16}ms`,
                  }}>
                    <span style={{
                      width: isFs ? 78 : 62, flexShrink: 0, marginTop: 1,
                      fontSize: isFs ? 12.5 : 10.5, fontWeight: 700, color: pal.textSoft,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}>{x.upAt || x.downAt}</span>

                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: isFs ? 13 : 11.5, fontWeight: 700, color: pal.text, overflowWrap: "anywhere" }}>
                        {x.title}
                        <span style={{ fontSize: isFs ? 11 : 9.5, fontWeight: 600, color: pal.muted }}>
                          {"  ·  "}{x.kindLabel} · {x.site}
                        </span>
                      </span>
                      <span style={{ fontSize: isFs ? 11.5 : 10, color: pal.textSoft, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                        {x.desc}
                      </span>
                    </span>

                    <span style={{
                      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.04em",
                      padding: "2px 7px 2px 5px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 1,
                      color: x.ongoing ? pal.DOWN : pal.UP,
                      background: x.ongoing ? pal.STATE_META.DOWN.bg : pal.STATE_META.UP.bg,
                    }}>
                      {x.ongoing ? <AlertCircle width={11} height={11} /> : <CheckCircle width={11} height={11} />}
                      {x.ongoing ? "BERLANGSUNG" : "SELESAI"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );

      const panelSites = (
        <div className="dashboard-panel" style={{ padding: pad, display: "flex", flexDirection: "column", minHeight: 0, maxHeight: isFs ? undefined : 380, overflow: "hidden" }}>
          <SectionHead title="Status Per Site" fs={isFs} sub={sites.length ? `${sites.length} site` : null} right={<Legend pal={pal} />} pal={pal} stripe={pal.teal} />
          <div
            ref={isFs ? sitesFit.ref : undefined}
            className={!isFs || !sitesFit.fits ? "noc-scroll" : undefined}
            style={{ minHeight: 0, flex: 1, overflowY: (!isFs || !sitesFit.fits) ? "auto" : "hidden", margin: "0 -4px", padding: "0 4px" }}
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: isFs ? `repeat(${sitesFit.cols}, 1fr)` : `repeat(auto-fill, minmax(230px, 1fr))`,
              gridAutoRows: isFs && sitesFit.fits ? "1fr" : undefined,
              height: isFs && sitesFit.fits ? "100%" : undefined,
              gap: isFs ? 10 : 8,
            }}>
              {sites.map((s, i) => (
                <SiteCard key={s.label} s={s} idx={i} pal={pal}
                  trend={(trend[`site:${s.label}`] || []).map((p) => p.latency_ms)} />
              ))}
              {sites.length === 0 && <div style={{ color: pal.muted, fontSize: 13, padding: "20px 0" }}>Menunggu data…</div>}
            </div>
          </div>
        </div>
      );

      const panelDevices = (
        <div className="dashboard-panel" style={{ padding: isFs ? "18px 20px" : pad, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", flex: isFs ? 1 : undefined }}>
          <SectionHead
            title="Perangkat / Access Point" fs={isFs} sub="MikroTik Netwatch" pal={pal} stripe={pal.navy}
            right={devices.length ? (
              <span style={{ fontSize: 11, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {dc.up} up · {dc.down} down{dc.unknown ? ` · ${dc.unknown} ?` : ""}
                {clientsTotal > 0 && (
                  <> · <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Users01 width={11} height={11} /> {clientsTotal} klien</span></>
                )}
              </span>
            ) : null}
          />
          {devices.length > 0 && (
            <>
              <div className="noc-scroll" style={{
                display: "flex", gap: 8, overflowX: "auto", paddingBottom: isFs ? 6 : 8, marginTop: isFs ? -2 : -4,
                flexShrink: 0,
              }}>
                {deviceStatusOptions.map(([key, label, color]) => (
                  <button key={key} onClick={() => setDeviceStatusFilter(key)} style={filterChip(deviceStatusFilter === key, color)}>
                    {label}
                  </button>
                ))}
                <span style={{ width: 1, alignSelf: "stretch", background: pal.border, flexShrink: 0 }} />
                <button onClick={() => setDeviceSiteFilter("ALL")} style={filterChip(deviceSiteFilter === "ALL")}>Semua Lokasi</button>
                {deviceSiteOptions.map((site) => (
                  <button key={site} onClick={() => setDeviceSiteFilter(site)} style={siteChip(deviceSiteFilter === site, siteColor(site))}>
                    {shortLabel(site)}
                  </button>
                ))}
              </div>

              <div style={{
                display: isFs ? "flex" : "grid",
                gridTemplateColumns: isFs ? undefined : "repeat(auto-fit, minmax(145px, 1fr))",
                gap: 8,
                overflowX: isFs ? "auto" : undefined,
                marginBottom: isFs ? 12 : 10,
                paddingBottom: isFs ? 2 : undefined,
                flexShrink: 0,
              }}>
                {deviceGroups.map((grp) => { const sc = siteColor(grp.site); return (
                  <button key={grp.site} onClick={() => setDeviceSiteFilter(grp.site)} className="noc-device-summary" style={{
                    textAlign: "left",
                    border: `1px solid ${deviceSiteFilter === grp.site ? sc : pal.border}`,
                    borderRadius: 10,
                    padding: isFs ? "9px 12px" : "8px 10px",
                    background: deviceSiteFilter === grp.site ? `${sc}12` : pal.surfaceAlt,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    minWidth: isFs ? 170 : 0,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: `${sc}1c`, color: sc,
                        }}>
                          <MarkerPin05 width={12} height={12} />
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 900, color: sc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortLabel(grp.site)}</span>
                      </span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: grp.down ? pal.DOWN : pal.UP, boxShadow: pal.dotGlow(grp.down ? pal.DOWN : pal.UP), flexShrink: 0 }} />
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800 }}>
                      {grp.up}/{grp.list.length} up{grp.down ? ` · ${grp.down} down` : ""}
                      {clients[grp.site] != null && (
                        <> · <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Users01 width={10} height={10} /> {clients[grp.site]}</span></>
                      )}
                    </div>
                  </button>
                ); })}
              </div>
            </>
          )}
          {devices.length === 0 ? (
            <div style={{ padding: "22px 0", textAlign: "center", color: pal.muted, fontSize: 13 }}>
              <AlertCircle width={20} height={20} style={{ display: "block", margin: "0 auto 8px" }} />
              Belum ada data Netwatch. Daftarkan perangkat di <code>/tool/netwatch</code> pada MikroTik.
            </div>
          ) : isFs ? (
            <div className="noc-scroll" style={{ minHeight: 0, flex: 1, overflowY: "auto", margin: "0 -6px", padding: "2px 6px 6px" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                gap: 14,
                alignItems: "start",
              }}>
                {filteredDeviceGroups.map((grp) => { const sc = siteColor(grp.site); return (
                  <div key={grp.site} className="noc-device-group" style={{
                    minWidth: 0,
                    border: `1px solid ${sc}33`,
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(255,255,255,0.52)",
                    boxShadow: "0 12px 28px -28px rgba(16,35,63,0.5)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: sc, letterSpacing: "0.03em", textTransform: "uppercase" }}>{shortLabel(grp.site)}</span>
                      <span style={{ height: 1, flex: 1, background: `${sc}33` }} />
                      <span style={{ fontSize: 12, color: grp.down ? pal.DOWN : pal.muted, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, whiteSpace: "nowrap" }}>
                        {grp.up}/{grp.list.length} up{grp.down ? ` · ${grp.down} down` : ""}
                      {clients[grp.site] != null && (
                        <> · <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Users01 width={10} height={10} /> {clients[grp.site]}</span></>
                      )}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 9 }}>
                      {grp.list.map((d, i) => <DeviceCard key={`${d.host}-${i}`} d={d} idx={i} compact pal={pal} accent={sc} trend={(trend[deviceKey(d)] || []).map((p) => p.latency_ms)} />)}
                    </div>
                  </div>
                ); })}
                {filteredDeviceGroups.length === 0 && (
                  <div style={{ color: pal.muted, fontSize: 13, padding: "18px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><AlertCircle width={14} height={14} /> Tidak ada perangkat sesuai filter.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="noc-scroll" style={{ overflowX: "auto", overflowY: "hidden", scrollbarGutter: "auto", margin: "0 -4px", padding: "0 4px", flexShrink: 0 }}>
              {/* Per site jadi kolom sejajar horizontal & discroll ke samping —
                  biar jumlah site nambah gak bikin section ini makin panjang ke bawah.
                  Tinggi kolomnya dipatok tetap (bukan ngikutin sisa ruang panel), biar
                  gak kegencet/nabrak sama filter & ringkasan di atasnya. */}
              <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(280px, 1fr)", gridAutoRows: "340px", gap: 14, height: 340 }}>
                {filteredDeviceGroups.map((grp) => { const sc = siteColor(grp.site); return (
                  <div key={grp.site} className="noc-device-group" style={{
                    minWidth: 0,
                    display: "flex", flexDirection: "column",
                    border: `1px solid ${sc}33`,
                    borderRadius: 12, padding: 11,
                    background: "rgba(255,255,255,0.55)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexShrink: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: sc, letterSpacing: "0.02em" }}>{shortLabel(grp.site)}</span>
                      <span style={{ height: 1, flex: 1, background: `${sc}33` }} />
                      <span style={{ fontSize: 10.5, color: grp.down ? pal.DOWN : pal.muted, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {grp.up}/{grp.list.length} up{grp.down ? ` · ${grp.down} down` : ""}
                      {clients[grp.site] != null && (
                        <> · <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><Users01 width={10} height={10} /> {clients[grp.site]}</span></>
                      )}
                      </span>
                    </div>
                    <div className="noc-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                      {grp.list.map((d, i) => <DeviceCard key={`${d.host}-${i}`} d={d} idx={i} pal={pal} accent={sc} trend={(trend[deviceKey(d)] || []).map((p) => p.latency_ms)} />)}
                    </div>
                  </div>
                ); })}
                {filteredDeviceGroups.length === 0 && (
                  <div style={{ color: pal.muted, fontSize: 13, padding: "18px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><AlertCircle width={14} height={14} /> Tidak ada perangkat sesuai filter.</div>
                )}
              </div>
            </div>
          )}
        </div>
      );

      return isFs ? (
        <div style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, gridTemplateRows: "minmax(230px, 0.38fr) minmax(0, 0.62fr)" }}>
          <div style={{ minHeight: 0, display: "grid", gap: 12, gridTemplateColumns: "0.92fr 1.08fr" }}>
            {panelProblems}
            {panelSites}
          </div>
          {panelDevices}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 14, alignItems: "stretch", gridTemplateColumns: isNarrow ? "minmax(0,1fr)" : "minmax(0, 0.9fr) minmax(0, 1.1fr)" }}>
            {panelProblems}
            {panelSites}
          </div>
          {panelDevices}
        </>
      );
      })()}

      {isFs && (
        <div style={{ flexShrink: 0, textAlign: "center", fontSize: 11, color: pal.muted, fontFamily: "'IBM Plex Mono', monospace", paddingTop: 2 }}>
          Auto-refresh 15 detik · Sumber: Zabbix + MikroTik Netwatch
        </div>
      )}

      {showHistory && (() => {
        const rawList = history || [];
        const q = histQuery.trim().toLowerCase();
        const evList = rawList.filter((h) => {
          if (histKind === "SITE" && h.kind !== "site") return false;
          if (histKind === "DEVICE" && h.kind === "site") return false;
          if (histStatus === "ONGOING" && !h.ongoing) return false;
          if (histStatus === "DONE" && h.ongoing) return false;
          if (q && !`${h.name || ""} ${h.router_name || ""}`.toLowerCase().includes(q)) return false;
          return true;
        });
        const filtered = rawList.length !== evList.length || !!q;
        const total = evList.length;
        const ongoingN = evList.filter((h) => h.ongoing).length;
        const siteN = evList.filter((h) => h.kind === "site").length;
        const worst = evList.reduce((m, h) => Math.max(m, h.duration_seconds || 0), 0);
        const byDay = {};
        for (const h of evList) {
          const day = String(h.down_at || "").slice(0, 10) || "–";
          (byDay[day] = byDay[day] || []).push(h);
        }
        const showBo = histKind === "ALL" && histStatus === "ALL" && !q;
        if (showBo) {
          for (const b of histBlackouts || []) {
            const day = String(b.started_at || "").slice(0, 10) || "–";
            (byDay[day] = byDay[day] || []).push({ _blackout: true, ...b });
          }
        }
        const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
        const totalBoSec = (histBlackouts || []).reduce((s, b) => s + (b.seconds || 0), 0);
        const dayLabel = (d) => {
          const dj = dayjs(d);
          if (!dj.isValid()) return d;
          if (d === dayjs().format("YYYY-MM-DD")) return "Hari ini";
          if (d === dayjs().subtract(1, "day").format("YYYY-MM-DD")) return "Kemarin";
          return `${HARI[dj.day()]}, ${dj.date()} ${BULAN[dj.month()]}`;
        };
        return (
        <div className="dashboard-popup-overlay" onClick={() => setShowHistory(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="dashboard-popup"
            style={{ width: "min(760px, 96vw)", maxHeight: "min(680px, 92vh)", display: "flex", flexDirection: "column" }}
          >
            {/* Header — template Piagam */}
            <div className="dashboard-popup__header">
              <div style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.14)", color: "#fff" }}>
                  <Clipboard width={18} height={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="dashboard-popup__eyebrow">Riwayat Downtime</p>
                  <h2 className="dashboard-popup__title">7 Hari Terakhir</h2>
                </div>
              </div>
              <button type="button" className="dashboard-popup__close" aria-label="Tutup" onClick={() => setShowHistory(false)}>
                <XClose width={18} height={18} />
              </button>
            </div>

            {/* Toolbar: ringkasan + filter — tetap kelihatan, gak ikut scroll */}
            <div style={{ padding: "16px 20px 0", flexShrink: 0, background: "#fff" }}>
              {(evList.length > 0 || totalBoSec > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {[
                    [`${total} kejadian`, LIGHT.navy],
                    ongoingN ? [`${ongoingN} masih down`, LIGHT.DOWN] : ["semua pulih", LIGHT.UP],
                    [`${siteN} site · ${total - siteN} perangkat`, LIGHT.textSoft],
                    worst ? [`terlama ${fmtAge(worst)}`, LIGHT.WARN] : null,
                    (showBo && totalBoSec > 0) ? [`⚠ tak terpantau ${fmtAge(totalBoSec)}`, LIGHT.WARN] : null,
                  ].filter(Boolean).map(([txt, c], i) => (
                    <span key={i} style={{ fontSize: 10.5, fontWeight: 800, color: c, background: `${c}14`, border: `1px solid ${c}33`, borderRadius: 7, padding: "3px 8px", letterSpacing: "0.02em" }}>{txt}</span>
                  ))}
                </div>
              )}
              {rawList.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <div style={{ position: "relative", flex: "1 1 190px", minWidth: 150 }}>
                    <SearchMd width={13} height={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: LIGHT.muted }} />
                    <input
                      value={histQuery}
                      onChange={(e) => setHistQuery(e.target.value)}
                      placeholder="Cari nama site / perangkat…"
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "6px 26px 6px 27px",
                        borderRadius: 8, border: `1px solid ${LIGHT.borderStrong}`, background: LIGHT.surfaceAlt,
                        fontSize: 11.5, color: LIGHT.text, fontFamily: "inherit", outline: "none",
                      }}
                    />
                    {histQuery && (
                      <button onClick={() => setHistQuery("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: LIGHT.muted, display: "flex", padding: 2 }}>
                        <XClose width={12} height={12} />
                      </button>
                    )}
                  </div>
                  {[
                    ["kind", histKind, setHistKind, [["ALL", "Semua"], ["SITE", "Site"], ["DEVICE", "Perangkat"]]],
                    ["status", histStatus, setHistStatus, [["ALL", "Semua status"], ["ONGOING", "Masih down"], ["DONE", "Selesai"]]],
                  ].map(([grp, val, setter, opts]) => (
                    <div key={grp} style={{ display: "flex", gap: 4 }}>
                      {opts.map(([k, label]) => {
                        const active = val === k;
                        const col = k === "ONGOING" ? LIGHT.DOWN : k === "DONE" ? LIGHT.UP : LIGHT.navy;
                        return (
                          <button key={k} onClick={() => setter(k)} style={{
                            border: `1px solid ${active ? col : LIGHT.borderStrong}`,
                            background: active ? `${col}14` : LIGHT.surfaceAlt,
                            color: active ? col : LIGHT.textSoft,
                            borderRadius: 7, padding: "5px 8px", fontSize: 10.5, fontWeight: 800,
                            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                          }}>{label}</button>
                        );
                      })}
                    </div>
                  ))}
                  {evList.length > 0 && (
                    <button onClick={exportHistory} className="dashboard-popup__button dashboard-popup__button--primary" style={{ minWidth: "auto", padding: "6px 12px", fontSize: 11 }} title="Export riwayat ke Excel">
                      <Download04 width={13} height={13} /> Excel
                    </button>
                  )}
                </div>
              )}
              <div style={{ height: 1, background: LIGHT.border, marginTop: 14 }} />
            </div>

            {/* Body */}
            <div className="noc-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 20px 18px" }}>
              {historyErr ? (
                <div style={{ color: LIGHT.DOWN, fontSize: 13, padding: "36px 0", textAlign: "center" }}>{historyErr}</div>
              ) : history === null ? (
                <div style={{ color: LIGHT.muted, fontSize: 13, padding: "36px 0", textAlign: "center" }}>Memuat…</div>
              ) : days.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "44px 0", color: filtered ? LIGHT.muted : LIGHT.UP }}>
                  <span style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: filtered ? LIGHT.surfaceAlt : LIGHT.STATE_META.UP.bg }}>
                    {filtered ? <SearchMd width={24} height={24} /> : <CheckCircle width={26} height={26} />}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: LIGHT.text }}>{filtered ? "Tidak ada yang cocok" : "Tidak ada downtime"}</span>
                  <span style={{ fontSize: 11.5, color: LIGHT.muted }}>{filtered ? "Coba ubah kata kunci atau filternya." : "Belum ada site / perangkat down dalam 7 hari terakhir."}</span>
                </div>
              ) : (
                days.map((day) => (
                  <div key={day} style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "sticky", top: 0, background: LIGHT.surface, zIndex: 1, paddingTop: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: LIGHT.textSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>{dayLabel(day)}</span>
                      <span style={{ height: 1, flex: 1, background: LIGHT.border }} />
                      <span style={{ fontSize: 10, color: LIGHT.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{byDay[day].length}×</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {byDay[day]
                        .slice()
                        .sort((a, b) => {
                          if (!!a.ongoing !== !!b.ongoing) return a.ongoing ? -1 : 1;
                          return String(b.down_at || b.started_at).localeCompare(String(a.down_at || a.started_at));
                        })
                        .map((h, i) => {
                          if (h._blackout) return (
                            <div key={i} className="noc-card" style={{
                              display: "flex", alignItems: "center", gap: 11, padding: "10px 12px",
                              borderRadius: 10, border: `1px solid ${LIGHT.WARN}33`, background: `${LIGHT.WARN}0d`,
                            }}>
                              <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${LIGHT.WARN}1f`, color: LIGHT.WARN }}>
                                <AlertTriangle width={16} height={16} />
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 800, color: LIGHT.WARN }}>Pemantauan berhenti</div>
                                <div style={{ fontSize: 10.5, color: LIGHT.textSoft, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                                  {hhmm(h.started_at)} → {hhmm(h.ended_at)} · server mati, kejadian singkat mungkin tak tercatat
                                </div>
                              </div>
                              <span style={{ flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: LIGHT.WARN }}>
                                {fmtAge(h.seconds)}
                                <div style={{ fontSize: 8.5, fontWeight: 700, color: LIGHT.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>tak terpantau</div>
                              </span>
                            </div>
                          );
                          const isSite = h.kind === "site";
                          const Icon = isSite ? MarkerPin05 : Server04;
                          const c = h.ongoing ? LIGHT.DOWN : LIGHT.UP;
                          return (
                            <div key={i} className="noc-card" style={{
                              display: "flex", alignItems: "center", gap: 11,
                              padding: "10px 12px", borderRadius: 10,
                              border: `1px solid ${h.ongoing ? `${LIGHT.DOWN}33` : LIGHT.border}`,
                              background: h.ongoing ? "rgba(217,45,32,0.035)" : LIGHT.surfaceAlt,
                            }}>
                              <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${c}18`, color: c }}>
                                <Icon width={16} height={16} />
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: LIGHT.text, overflowWrap: "anywhere" }}>
                                  {shortLabel(h.name)}
                                  <span style={{ fontSize: 10, fontWeight: 600, color: LIGHT.muted }}>{"  ·  "}{isSite ? "Koneksi site" : "Perangkat"}</span>
                                </div>
                                <div style={{ fontSize: 10.5, color: LIGHT.textSoft, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: LIGHT.DOWN }}><XCircle width={10} height={10} />{hhmm(h.down_at)}</span>
                                  <span style={{ color: LIGHT.mutedAccent }}>→</span>
                                  {h.up_at
                                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: LIGHT.UP }}><CheckCircle width={10} height={10} />{hhmm(h.up_at)}</span>
                                    : <span style={{ color: LIGHT.DOWN, fontWeight: 800 }}>masih down</span>}
                                </div>
                              </div>
                              <span style={{
                                flexShrink: 0, textAlign: "right",
                                fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace",
                                color: h.ongoing ? LIGHT.DOWN : (h.duration_seconds || 0) >= 1800 ? LIGHT.WARN : LIGHT.textSoft,
                              }}>
                                {fmtAge(h.duration_seconds)}
                                <div style={{ fontSize: 8.5, fontWeight: 700, color: LIGHT.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h.ongoing ? "berjalan" : "durasi"}</div>
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {showStats && (() => {
        const V = KEANDALAN_VIOLET;
        const rows = stats || [];
        const upClr = (p) => (p == null ? LIGHT.muted : p >= 99.9 ? LIGHT.UP : p >= 99 ? LIGHT.WARN : LIGHT.DOWN);
        const avgUp = rows.length ? rows.reduce((s, r) => s + (r.uptime_pct ?? 100), 0) / rows.length : null;
        const totalInc = rows.reduce((s, r) => s + (r.incidents || 0), 0);
        const totalDown = rows.reduce((s, r) => s + (r.downtime_seconds || 0), 0);
        const GLOS = [
          ["Uptime", "Persentase waktu site normal selama 7 hari. 100% = tidak pernah putus. Di bawah 99% berarti total mati sudah lebih dari ±1,7 jam seminggu."],
          ["Insiden", "Berapa kali site tercatat putus (turun lalu naik lagi) dalam 7 hari."],
          ["Total Down", "Akumulasi lama site tidak bisa diakses selama 7 hari (semua insiden dijumlah)."],
          ["MTTR", "Mean Time To Recovery — rata-rata lama pemulihan per insiden (Total Down ÷ Insiden). Makin kecil makin cepat ditangani."],
        ];
        return (
        <div className="dashboard-popup-overlay" onClick={() => setShowStats(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="dashboard-popup"
            style={{ width: "min(780px, 96vw)", maxHeight: "min(680px, 92vh)", display: "flex", flexDirection: "column" }}
          >
            {/* Header — template Piagam */}
            <div className="dashboard-popup__header">
              <div style={{ display: "flex", gap: 11, alignItems: "center", minWidth: 0 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.14)", color: "#fff" }}>
                  <BarChartSquare02 width={18} height={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="dashboard-popup__eyebrow">Keandalan Per Site</p>
                  <h2 className="dashboard-popup__title">Statistik 7 Hari</h2>
                </div>
              </div>
              <button type="button" className="dashboard-popup__close" aria-label="Tutup" onClick={() => setShowStats(false)}>
                <XClose width={18} height={18} />
              </button>
            </div>

            {/* Toolbar: ringkasan — tetap kelihatan, gak ikut scroll */}
            <div style={{ padding: "16px 20px 0", flexShrink: 0, background: "#fff" }}>
              {rows.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {[
                    [`rata-rata uptime ${avgUp == null ? "–" : avgUp.toFixed(2) + "%"}`, upClr(avgUp)],
                    [`${totalInc} insiden total`, LIGHT.navy],
                    [`total down ${fmtAge(totalDown)}`, LIGHT.WARN],
                  ].map(([txt, c], i) => (
                    <span key={i} style={{ fontSize: 10.5, fontWeight: 800, color: c, background: `${c}14`, border: `1px solid ${c}33`, borderRadius: 7, padding: "3px 8px" }}>{txt}</span>
                  ))}
                </div>
              )}
              <div style={{ height: 1, background: LIGHT.border, marginTop: 14 }} />
            </div>

            {/* Body */}
            <div className="noc-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 18px" }}>
              {statsErr ? (
                <div style={{ color: LIGHT.DOWN, fontSize: 13, padding: "36px 0", textAlign: "center" }}>{statsErr}</div>
              ) : stats === null ? (
                <div style={{ color: LIGHT.muted, fontSize: 13, padding: "36px 0", textAlign: "center" }}>Memuat…</div>
              ) : rows.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "44px 0", color: LIGHT.UP }}>
                  <span style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: LIGHT.STATE_META.UP.bg }}>
                    <CheckCircle width={26} height={26} />
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Semua site 100%</span>
                  <span style={{ fontSize: 11.5, color: LIGHT.muted }}>Tidak ada insiden down tercatat dalam 7 hari terakhir.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {rows.map((r, i) => {
                    const p = r.uptime_pct;
                    const c = upClr(p);
                    return (
                      <div key={i} className="noc-card" style={{ padding: "11px 13px", borderRadius: 11, border: `1px solid ${r.ongoing ? `${LIGHT.DOWN}33` : LIGHT.border}`, background: r.ongoing ? "rgba(217,45,32,0.035)" : LIGHT.surfaceAlt }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: LIGHT.text, overflowWrap: "anywhere" }}>
                            {shortLabel(r.name)}
                            {r.ongoing && <span style={{ fontSize: 9.5, fontWeight: 800, color: LIGHT.DOWN, background: LIGHT.STATE_META.DOWN.bg, borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>SEDANG DOWN</span>}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: c, fontFamily: "'IBM Plex Mono', monospace" }}>{p == null ? "–" : `${p}%`}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: `${c}1f`, marginTop: 7, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, p ?? 100))}%`, background: c, borderRadius: 4 }} />
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10.5, color: LIGHT.textSoft, fontFamily: "'IBM Plex Mono', monospace", flexWrap: "wrap" }}>
                          <span><b style={{ color: LIGHT.text }}>{r.incidents}</b> insiden</span>
                          <span>down <b style={{ color: LIGHT.text }}>{fmtAge(r.downtime_seconds)}</b></span>
                          <span>MTTR <b style={{ color: LIGHT.text }}>{r.mttr_seconds == null ? "–" : fmtAge(r.mttr_seconds)}</b></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Penjelasan istilah */}
              <div style={{ marginTop: 16, border: `1px solid ${LIGHT.border}`, borderRadius: 11, padding: "12px 14px", background: `${V}09` }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: V, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Arti istilah</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {GLOS.map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11, color: LIGHT.textSoft, lineHeight: 1.45 }}>
                      <b style={{ color: LIGHT.text }}>{k}</b> — {v}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: LIGHT.muted, marginTop: 9, lineHeight: 1.45 }}>
                  Sumber: log Netwatch/Zabbix NOC sejak fitur ini aktif. Site yang belum pernah down tidak muncul (uptime-nya 100%).
                  {(statBlackouts || []).length > 0 && (
                    <> Server sempat mati{" "}
                      <b style={{ color: LIGHT.WARN }}>
                        (total {fmtAge((statBlackouts || []).reduce((s, b) => s + (b.seconds || 0), 0))} dalam 7 hari)
                      </b>: perangkat yang masih terganggu setelahnya tetap dihitung sejak sebelum jeda; kejadian singkat yang murni di dalam jeda mungkin tak tercatat.
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <style>{`
        @keyframes noc-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes noc-live { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.35; transform: scale(0.82) } }
        @keyframes noc-fade-up { from { opacity: 0; transform: translateY(9px) } to { opacity: 1; transform: none } }
        @keyframes noc-pop { 0% { transform: scale(.55); opacity: 0 } 62% { transform: scale(1.12) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes noc-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: .2 } }
        @keyframes noc-alarm-ring { 0%,100% { box-shadow: 0 0 0 0 ${pal.DOWN}00 } 50% { box-shadow: 0 0 0 4px ${pal.DOWN}29 } }
        @keyframes noc-bar { 0% { left: -35%; width: 35% } 60% { left: 100%; width: 55% } 100% { left: 100%; width: 0 } }

        .noc-wall .dashboard-panel { box-shadow: none; border: 1px solid ${pal.borderStrong}; animation: noc-fade-up .42s ease both; }
        .noc-card { animation: noc-fade-up .4s ease both; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
        .noc-logrow { animation: noc-fade-up .3s ease both; transition: box-shadow .14s ease; }
        .noc-logrow:hover { box-shadow: inset 0 0 0 999px rgba(33,76,154,0.04); }
        .noc-card:hover { transform: translateY(-2px); border-color: rgba(33,76,154,0.28); box-shadow: 0 14px 28px -24px rgba(16,35,63,0.55); }
        .noc-counter { box-shadow: 0 14px 30px -28px rgba(16,35,63,0.50); }
        .noc-fs .noc-counter { background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,251,255,0.94)); border-color: rgba(33,76,154,0.18); }
        .noc-alarm { animation: noc-fade-up .4s ease both, noc-alarm-ring 1.8s ease-in-out infinite .4s; }
        .noc-pop { animation: noc-pop .38s cubic-bezier(.2,.75,.3,1) both; }

        .noc-loadbar { position: absolute; top: 0; left: 0; right: 0; height: 3px; overflow: hidden; z-index: 30; border-radius: 3px; }
        .noc-loadbar > i { position: absolute; top: 0; height: 100%; background: linear-gradient(90deg, ${pal.navy}, ${pal.teal}); animation: noc-bar 1.1s ease-in-out infinite; }

        .noc-scroll { scrollbar-width: thin; scrollbar-color: rgba(33,76,154,0.22) transparent; scrollbar-gutter: stable; }
        .noc-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .noc-scroll::-webkit-scrollbar-thumb { background: rgba(33,76,154,0.22); border-radius: 9px; }
        .noc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(33,76,154,0.36); }
        .noc-scroll::-webkit-scrollbar-track { background: transparent; }

        .noc-fs { color-scheme: light; }
        .noc-fs .dashboard-panel {
          box-shadow: 0 20px 50px -34px rgba(16,35,63,0.45);
          border: 1px solid ${WALL.borderStrong};
          border-radius: 16px;
          background: ${WALL.panelBg};
          backdrop-filter: blur(10px);
          color: ${WALL.text};
        }
        .noc-fs .noc-head {
          background: linear-gradient(90deg, rgba(255,255,255,0.98), rgba(247,251,255,0.94));
          border-color: rgba(33,76,154,0.20);
          box-shadow: 0 18px 44px -34px rgba(33,76,154,0.55);
        }
        .noc-wall:fullscreen { overflow: hidden; }

        @media (prefers-reduced-motion: reduce) {
          .noc-wall *, .noc-card, .noc-alarm, .noc-pop { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}

const Legend = ({ pal }) => (
  <div style={{ display: "flex", gap: 10, fontSize: 10.5, color: pal.muted }}>
    {[["UP", pal.UP, CheckCircle], ["WARN", pal.WARN, AlertTriangle], ["DOWN", pal.DOWN, XCircle]].map(([l, c, Icon]) => (
      <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, color: c }}>
        <Icon width={11} height={11} />{l}
      </span>
    ))}
  </div>
);
