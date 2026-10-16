/* ─────────────────────────────────────────────────────────────
   Komponen bersama gaya NetSuite. Semua halaman memakai ini supaya
   judul halaman, panel, tombol, banner, dan tabel tampil seragam.
   ───────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import {
  Globe01, MarkerPin01, AlertTriangle, Clock, Wifi, FilterLines, Users01,
  Calendar, LineChartUp01, PieChart01, Table, BarChart01, Server04,
} from "@untitledui/icons";

export const NS = {
  font:     "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",
  text:     "#333333",
  label:    "#666666",
  muted:    "#8a8a8a",
  link:     "#255599",
  band:     "#dfe4eb",   // pita judul seksi
  bandText: "#4d5f79",
  colHead:  "#e5e5e5",   // kepala kolom tabel
  zebra:    "#f5f7fa",
  hover:    "#e5eefa",
  field:    "#cccccc",
  surface:  "#ffffff",
  page:     "#f6f7f9",
  ok:       "#2e7d32",
  okBg:     "#d7fccf",
  bad:      "#c62828",
  badBg:    "#fccfcf",
  warn:     "#8a6100",
  warnBg:   "#fcf3cf",
  infoBg:   "#d5e3f8",
  primary:  "#2a5db0",
  navy:     "#16315f",
};

export function useIsMobile(width = 720) {
  const get = () => (typeof window === "undefined" ? false : window.innerWidth < width);
  const [m, setM] = useState(get);
  useEffect(() => {
    const h = () => setM(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

export const btn = (primary, disabled) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "5px 14px", minHeight: 30, borderRadius: 3, fontSize: 13, fontWeight: 600,
  fontFamily: NS.font, whiteSpace: "nowrap",
  border: `1px solid ${primary ? NS.primary : "#b2b2b2"}`,
  background: primary ? NS.primary : "#e9e9e9",
  color: primary ? "#fff" : NS.text,
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

export const fieldStyle = {
  height: 30, padding: "0 8px", borderRadius: 3, border: `1px solid ${NS.field}`,
  fontSize: 13, color: NS.text, background: NS.surface, outline: "none", fontFamily: NS.font, width: "100%",
};

/* Judul halaman: nama besar di kiri, keterangan kecil di bawahnya, tombol di kanan. */
export function PageHeader({ title, subtitle, actions }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, letterSpacing: "-0.01em", color: NS.text, lineHeight: 1.25 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: NS.label, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/* Pita judul seksi abu-biru. */
/* Ikon judul panel, dicari dari teks judulnya (judul yang tidak ada di sini tampil tanpa ikon). */
const BAND_ICONS = {
  "Koneksi Internet": Globe01,
  "Kondisi per Lokasi": MarkerPin01,
  "Status Per Site": MarkerPin01,
  "Paling Sering Bermasalah": AlertTriangle,
  "Log Insiden": AlertTriangle,
  "Gangguan Terbaru": Clock,
  "Perangkat / Access Point": Wifi,
  "Filter": FilterLines,
  "Daftar User Aktif": Users01,
  "Periode Laporan": Calendar,
  "Traffic Chart": LineChartUp01,
  "Distribusi Bandwidth": PieChart01,
  "Ringkasan Trafik": Table,
  "Breakdown Weighted Score": BarChart01,
  "Router Overview": Server04,
};

export function BandTitle({ children }) {
  const Icon = typeof children === "string" ? BAND_ICONS[children] : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {Icon && <Icon width={16} height={16} />}
      {children}
    </span>
  );
}

export function Band({ children, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
      padding: "7px 12px", background: NS.band, color: NS.bandText, fontSize: 14, fontWeight: 700,
    }}>
      <BandTitle>{children}</BandTitle>
      {right && <span style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{right}</span>}
    </div>
  );
}

/* Panel putih dengan pita judul opsional. */
export function Panel({ title, right, children, pad = 0, style }) {
  return (
    <div style={{ background: NS.surface, borderRadius: 3, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.08)", ...style }}>
      {title && <Band right={right}>{title}</Band>}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

/* Banner pemberitahuan gaya NetSuite: ok / bad / warn / info. */
export function Alert({ tone, title, children }) {
  const c = { ok: [NS.okBg, NS.ok, "✓"], bad: [NS.badBg, NS.bad, "!"], warn: [NS.warnBg, NS.warn, "!"], info: [NS.infoBg, NS.primary, "i"] }[tone];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 14px", background: c[0], borderRadius: 3, fontSize: 13, color: NS.text, lineHeight: 1.55 }}>
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: c[1], color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
      }}>{c[2]}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {title && <div style={{ fontWeight: 700, fontSize: 14, color: c[1] }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

/* Label + isian bertumpuk, seperti form NetSuite. */
export function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
      {children}
    </label>
  );
}

/* Kotak angka ringkasan (KPI) seragam. */
export function Kpi({ label, value, sub, color = NS.navy, icon }) {
  return (
    <div style={{
      background: NS.surface, borderRadius: 3, boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, minWidth: 0,
    }}>
      {icon && (
        <span style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 3, background: NS.zebra, color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{icon}</span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: NS.label, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* Subtab gaya NetSuite di atas tabel. */
export function SubTabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: NS.band, padding: "6px 6px 0", flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            padding: "7px 16px", border: "none", borderRadius: "3px 3px 0 0", cursor: "pointer",
            fontFamily: NS.font, fontSize: 13, fontWeight: 700,
            background: on ? NS.surface : "transparent", color: on ? NS.text : NS.bandText,
          }}>{t.label}</button>
        );
      })}
    </div>
  );
}

/* Tampilan HP pengganti baris tabel: judul + sub di kiri, status di kanan, isi di bawah. */
export function MItem({ i = 0, title, sub, right, children, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: "11px 12px", background: i % 2 ? NS.zebra : NS.surface,
      borderTop: i ? `1px solid ${NS.colHead}` : "none", cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflowWrap: "anywhere" }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: NS.label, marginTop: 1 }}>{sub}</div>}
        </div>
        {right && <div style={{ flexShrink: 0, fontSize: 12.5 }}>{right}</div>}
      </div>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

/* Deret label kecil + nilai untuk MItem. */
export function MFacts({ items, cols = 3 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: NS.label }}>{k}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: "anywhere" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export const th = { padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", background: NS.colHead };
export const td = { padding: "8px 12px", fontSize: 13, color: NS.text, verticalAlign: "top" };
export const zebraRow = (i, hovered) => ({ background: hovered ? NS.hover : i % 2 ? NS.zebra : NS.surface });
