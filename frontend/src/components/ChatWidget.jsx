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

  // HP: layar penuh setinggi viewport dinamis (dvh) supaya tidak tertutup bilah browser/keyboard.
  const panelStyle = isMobile
    ? { top: 0, left: 0, right: 0, height: "100dvh", borderRadius: 0, border: "none" }
    : {
      right: 24, bottom: 88, width: 380, height: "min(620px, calc(100vh - 112px))", borderRadius: 16,
      border: "1px solid rgba(195,204,217,0.7)",
    };

  const fabSize = 52; // sama dengan tombol kembali ke atas (.ns-totop)
  const fabEdge = isMobile ? 16 : 24;

  return createPortal((
    <>
      <style>{`
        @keyframes cw-pop { from { opacity: 0; transform: translateY(16px) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes cw-slide { from { transform: translateY(100%) } to { transform: none } }
        @keyframes cw-pulse { 0% { box-shadow: 0 0 0 0 rgba(37,211,102,.55) } 70% { box-shadow: 0 0 0 12px rgba(37,211,102,0) } 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0) } }
        .cw-fab:active { transform: scale(.94) !important; }
      `}</style>

      {mounted && (
        <div
          role="dialog"
          aria-label="Chat Hermes NOC"
          aria-hidden={!open}
          style={{
            position: "fixed", zIndex: 2500, overflow: "hidden", background: "#fff",
            boxShadow: "0 18px 50px rgba(20,40,77,0.28), 0 2px 8px rgba(20,40,77,0.12)",
            display: open ? "block" : "none",
            animation: open ? (isMobile ? "cw-slide .24s cubic-bezier(.2,.8,.2,1)" : "cw-pop .2s ease-out") : "none",
            transformOrigin: "bottom right",
            ...panelStyle,
          }}
        >
          <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: "#666" }}>Memuat chat…</div>}>
            <NetworkChat compact onClose={() => setOpen(false)} onAnswer={() => { if (!openRef.current) setUnread(true); }} />
          </Suspense>
        </div>
      )}

      {!(open && isMobile) && (
        <div style={{
          position: "fixed", zIndex: 2501, display: "flex", alignItems: "center", gap: 10,
          right: `calc(${fabEdge}px + env(safe-area-inset-right))`,
          bottom: `calc(${fabEdge}px + env(safe-area-inset-bottom))`,
        }}>
          {hover && !open && !isMobile && (
            <div style={{
              background: "#fff", color: "#333", fontSize: 12.5, fontWeight: 600, padding: "8px 12px",
              borderRadius: 999, border: "1px solid #dde3ec", boxShadow: "0 4px 14px rgba(11,20,26,0.15)", whiteSpace: "nowrap",
              animation: "cw-pop .15s ease-out",
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
            className="cw-fab"
            style={{
              position: "relative", width: fabSize, height: fabSize, borderRadius: "50%", border: "none",
              background: "linear-gradient(135deg, #3a74d1 0%, #2a5db0 55%, #1d3a6e 100%)",
              color: "#fff", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 18px rgba(20,40,77,0.38), 0 2px 4px rgba(20,40,77,0.2)",
              transition: "transform .15s ease", transform: hover ? "scale(1.07)" : "none",
              animation: unread ? "cw-pulse 1.6s infinite" : "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {open ? <XClose width={22} height={22} /> : <RobotIcon size={26} />}
            {unread && !open && (
              <span style={{
                position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%",
                background: "#25d366", border: "2px solid #fff",
              }} />
            )}
          </button>
        </div>
      )}
    </>
  ), document.body); // langsung di <body>: <main> punya stacking context sendiri
}
