/* ─────────────────────────────────────────────────────────────
   Komponen bersama gaya NetSuite. Semua halaman memakai ini supaya
   judul halaman, panel, tombol, banner, dan tabel tampil seragam.
   ───────────────────────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";
import {
  Globe01, MarkerPin01, AlertTriangle, Clock, Wifi, FilterLines, Users01,
  Calendar, LineChartUp01, PieChart01, Table, BarChart01, Server04,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Bell04,
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
  navy:     "#1c2a3f",   // navy header
  gold:     "#d9ad5b",   // aksen emas header
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

/* Tombol: ukuran di sini, warna & efek hover di class .ns-btn (netsuite.css)
   supaya senada header -- utama navy, biasa putih bertepi abu. */
export const btn = (primary, disabled) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "0 12px", height: 30, lineHeight: 1, borderRadius: 3, fontSize: 12.5, fontWeight: 600,
  fontFamily: NS.font, whiteSpace: "nowrap",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});
export const btnClass = (primary) => (primary ? "ns-btn ns-btn--primary" : "ns-btn");

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

/* Tombol "Alert" untuk PageHeader: pengganti banner peringatan di atas halaman.
   Titik warnanya mengikuti yang terburuk (merah / kuning / hijau); diklik membuka
   daftar peringatan halaman itu. items = [{ tone, title, body }], null = sembunyikan,
   kosong = tampil "Normal" dengan okText. Tiap halaman punya tombol & isinya sendiri. */
export function AlertButton({ items, okText = "Tidak ada peringatan." }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items == null) return null;
  const issues = items.filter((i) => i.tone !== "ok");
  const worst = items.some((i) => i.tone === "bad") ? "bad" : items.some((i) => i.tone === "warn") ? "warn" : "ok";
  const dot = { bad: NS.bad, warn: "#d9892b", ok: NS.ok }[worst];

  const toggle = () => {
    if (!open && isMobile && wrapRef.current) setPos(wrapRef.current.getBoundingClientRect().bottom + 6);
    setOpen((v) => !v);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" className="ns-btn" onClick={toggle} aria-expanded={open}
        style={{ ...btn(false), gap: 7 }}>
        <Bell04 width={14} height={14} />
        {issues.length ? `Alert (${issues.length})` : "Normal"}
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
      </button>
      {open && (
        <div role="dialog" aria-label="Alert" style={{
          position: isMobile ? "fixed" : "absolute", zIndex: 160,
          ...(isMobile ? { left: 12, right: 12, top: pos ?? 120 } : { right: 0, top: "calc(100% + 6px)", width: 440 }),
          maxHeight: "70vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
          padding: 8, background: "#fff", border: "1px solid #d5dbe4", borderRadius: 3,
          boxShadow: "0 8px 24px rgba(20,30,46,0.25)", textAlign: "left", fontWeight: 400,
        }}>
          {items.length === 0
            ? <Alert tone="ok" title="Normal">{okText}</Alert>
            : items.map((it, i) => <Alert key={i} tone={it.tone} title={it.title}>{it.body}</Alert>)}
        </div>
      )}
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
            background: on ? NS.surface : "transparent", color: on ? NS.navy : NS.bandText,
            boxShadow: on ? `inset 0 2px 0 ${NS.gold}` : "none",
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

/* ── Daftar gaya NetSuite (dipakai Active Users & Network Log) ── */
export const NS_SHADOW = "0 1px 2px rgba(0,0,0,0.08)";
export const listPanel = { background: NS.surface, borderRadius: 3, boxShadow: NS_SHADOW, overflow: "hidden" };
export const listTh = { ...th, borderRight: "1px solid #d5d5d5", borderBottom: "1px solid #c8c8c8", position: "sticky", top: 0, zIndex: 1 };
export const listTd = { ...td, padding: "6px 12px", borderBottom: "1px solid #ebebeb" };
export const toolbarLabel = { fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", letterSpacing: "0.03em" };
const pageBtn = (disabled) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0,
  borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
});

/* Pita FILTERS yang bisa dilipat; isinya kolom isian berjajar. */
export function FilterBar({ open, onToggle, children, title = "FILTERS" }) {
  return (
    <>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{
        display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 12px", border: "none",
        background: NS.band, color: NS.bandText, fontFamily: NS.font, fontSize: 12, fontWeight: 700,
        letterSpacing: "0.04em", cursor: "pointer", textAlign: "left",
      }}>
        {open ? <ChevronDown width={14} height={14} /> : <ChevronRight width={14} height={14} />}
        <FilterLines width={14} height={14} /> {title}
      </button>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", padding: "10px 12px 12px", borderBottom: "1px solid #e3e6eb" }}>
          {children}
        </div>
      )}
    </>
  );
}

/* Satu isian di FilterBar: label kecil kapital di atas kontrol. */
export function FilterField({ label, width = 220, children }) {
  const isMobile = useIsMobile();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: isMobile ? "1 1 100%" : `0 1 ${width}px` }}>
      <span style={toolbarLabel}>{label}</span>
      {children}
    </label>
  );
}

/* Kepala kolom yang bisa diklik untuk mengurutkan; panah menandai kolom aktif. */
export function SortTh({ label, active, dir = 1, onClick, style }) {
  return (
    <th style={{ ...listTh, cursor: onClick ? "pointer" : "default", color: active ? NS.navy : NS.label, userSelect: "none", ...style }}
      onClick={onClick} title={onClick ? "Klik untuk mengurutkan" : undefined}
      aria-sort={active ? (dir === 1 ? "ascending" : "descending") : undefined}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {active && (dir === 1 ? <ChevronUp width={12} height={12} /> : <ChevronDown width={12} height={12} />)}
      </span>
    </th>
  );
}

/* Kaki daftar: "Showing a–b of n", jumlah baris per halaman, lalu navigasi halaman di kanan.
   perPage berupa string angka atau "all". */
export function ListFooter({
  total, page, perPage, onPage, onPerPage, options = ["10", "25", "50", "100"],
  text = { showing: "Showing", of: "of", show: "Show", all: "All" },
}) {
  if (!total) return null;
  const size = perPage === "all" ? total : Number(perPage);
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size + 1;
  const end = Math.min(cur * size, total);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "6px 12px", background: NS.zebra, borderTop: "1px solid #e3e6eb", fontSize: 12, color: NS.label }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span>{text.showing} <b style={{ color: NS.text }}>{start}–{end}</b> {text.of} <b style={{ color: NS.text }}>{total}</b></span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={toolbarLabel}>{text.show}</span>
          <select value={perPage} onChange={(e) => onPerPage(e.target.value)} style={{ ...fieldStyle, width: 72, height: 26 }}>
            {options.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="all">{text.all}</option>
          </select>
        </label>
      </span>
      {perPage !== "all" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button type="button" aria-label="Previous page" onClick={() => onPage(Math.max(1, cur - 1))}
            disabled={cur === 1} className="ns-btn" style={pageBtn(cur === 1)}><ChevronLeft width={14} height={14} /></button>
          <select value={cur} onChange={(e) => onPage(Number(e.target.value))} aria-label="Page"
            style={{ ...fieldStyle, width: "auto", height: 26, padding: "0 6px" }}>
            {Array.from({ length: pages }, (_, k) => k + 1).map((pg) => (
              <option key={pg} value={pg}>{(pg - 1) * size + 1} – {Math.min(pg * size, total)} {text.of} {total}</option>
            ))}
          </select>
          <button type="button" aria-label="Next page" onClick={() => onPage(Math.min(pages, cur + 1))}
            disabled={cur === pages} className="ns-btn" style={pageBtn(cur === pages)}><ChevronRight width={14} height={14} /></button>
        </span>
      )}
    </div>
  );
}
