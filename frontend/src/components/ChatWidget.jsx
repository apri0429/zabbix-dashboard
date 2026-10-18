import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XClose } from "@untitledui/icons";
import { useIsMobile } from "./ns";

/* Tombol chat melayang di pojok kanan bawah semua halaman (seperti widget "chat
   dengan CS"). Diklik -> jendela chat Hermes NOC. Isi chat baru dimuat saat
   pertama dibuka, lalu tetap terpasang supaya jawaban yang sedang ditunggu
   tidak hilang walau jendelanya ditutup. */
const NetworkChat = lazy(() => import("../pages/NetworkChat"));

const TEAL = "#2a5db0"; // NS.primary

/* Ikon robot (Untitled UI tidak punya): kepala solid putih, mata & mulut
   warna tombol supaya terbaca jelas sebagai wajah. */
function RobotIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="11.2" y="3" width="1.6" height="3.5" rx="0.8" fill="currentColor" />
      <circle cx="12" cy="2.6" r="1.5" fill="currentColor" />
      <rect x="1.5" y="10.5" width="2.2" height="4.5" rx="1.1" fill="currentColor" />
      <rect x="20.3" y="10.5" width="2.2" height="4.5" rx="1.1" fill="currentColor" />
      <rect x="4.5" y="6" width="15" height="13.5" rx="4" fill="currentColor" />
      <circle cx="9.2" cy="11.8" r="1.7" fill={TEAL} />
      <circle cx="14.8" cy="11.8" r="1.7" fill={TEAL} />
      <rect x="9.3" y="15.2" width="5.4" height="1.6" rx="0.8" fill={TEAL} />
    </svg>
  );
}

export default function ChatWidget() {
  const isMobile = useIsMobile(560);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(false);
  const [hover, setHover] = useState(false);
  // Dibaca saat jawaban masuk (bisa lama setelah dikirim), jadi pakai ref, bukan state lama.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open) return undefined;
    setMounted(true);
    setUnread(false);
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Di HP jendela chat layar penuh: kunci scroll halaman di belakangnya.
  useEffect(() => {
    if (!(open && isMobile)) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const panelStyle = isMobile
    ? { inset: 0, borderRadius: 0 }
    : { right: 28, bottom: 80, width: 350, height: "min(500px, calc(100vh - 100px))", borderRadius: 6 };

  return createPortal((
    <>
      <style>{`
        @keyframes cw-pop { from { opacity: 0; transform: translateY(16px) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes cw-pulse { 0% { box-shadow: 0 0 0 0 rgba(37,211,102,.55) } 70% { box-shadow: 0 0 0 10px rgba(37,211,102,0) } 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0) } }
      `}</style>

      {mounted && (
        <div
          role="dialog"
          aria-label="Chat Hermes NOC"
          aria-hidden={!open}
          style={{
            position: "fixed", zIndex: 2500, overflow: "hidden", background: "#fff",
            border: "1px solid #c3ccd9", boxShadow: "0 10px 30px rgba(20,40,77,0.25)",
            display: open ? "block" : "none", animation: open ? "cw-pop .18s ease-out" : "none",
            ...panelStyle,
          }}
        >
          <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: "#666" }}>Memuat chat…</div>}>
            <NetworkChat compact onClose={() => setOpen(false)} onAnswer={() => { if (!openRef.current) setUnread(true); }} />
          </Suspense>
        </div>
      )}

      {!(open && isMobile) && (
        <div style={{ position: "fixed", right: 28, bottom: 28, zIndex: 2501, display: "flex", alignItems: "center", gap: 10 }}>
          {hover && !open && !isMobile && (
            <div style={{
              background: "#fff", color: "#333", fontSize: 12, fontWeight: 600, padding: "6px 10px",
              borderRadius: 3, border: "1px solid #c3ccd9", boxShadow: "0 4px 14px rgba(11,20,26,0.18)", whiteSpace: "nowrap",
            }}>
              Tanya jaringan ke Hermes
            </div>
          )}
          <button
            type="button"
            aria-label={open ? "Tutup chat" : "Buka chat Hermes NOC"}
            title={open ? "Tutup chat" : "Tanya jaringan"}
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              position: "relative", width: 42, height: 42, borderRadius: "50%", border: "none",
              background: TEAL, color: "#fff", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              boxShadow: "0 3px 10px rgba(20,40,77,0.35)",
              transition: "transform .15s ease", transform: hover ? "scale(1.06)" : "none",
              animation: unread ? "cw-pulse 1.6s infinite" : "none",
            }}
          >
            {open ? <XClose width={18} height={18} /> : <RobotIcon size={21} />}
            {unread && !open && (
              <span style={{
                position: "absolute", top: 0, right: 0, width: 12, height: 12, borderRadius: "50%",
                background: "#25d366", border: "2px solid #fff",
              }} />
            )}
          </button>
        </div>
      )}
    </>
  ), document.body); // langsung di <body>: <main> punya stacking context sendiri
}
