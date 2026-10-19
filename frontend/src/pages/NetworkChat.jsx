import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";
import {
  Send01, Plus, SearchMd, Trash01, ArrowLeft, Stars02, RefreshCw01, XClose, Copy01, Check,
} from "@untitledui/icons";
import { API_BASE } from "../api";
import { NS, useIsMobile } from "../components/ns";

/* Chat "Tanya Jaringan" (tata letak ala WhatsApp Web, warna tema NetSuite): daftar percakapan di kiri, ruang
   chat di kanan. Percakapan disimpan di browser ini saja (localStorage). */

const STORAGE_KEY = "netrowatch-chats-v2";
const MAX_CHATS = 50;

/* Palet mengikuti tema NetSuite aplikasi (navy + biru korporat). */
const WA = {
  teal: NS.primary,
  green: NS.ok,
  head: "linear-gradient(90deg, #14284d 0%, #1d3a6e 50%, #26508f 100%)",
  panel: NS.band,
  wall: "#eef2f7",
  mine: "linear-gradient(135deg, #2f67c2 0%, #2a5db0 60%, #24519c 100%)",
  theirs: "#ffffff",
  text: NS.text,
  sub: NS.label,
  border: "#d5dbe4",
  active: NS.hover,
  tick: NS.primary,
};

const SUGGESTIONS = [
  "Ada perangkat atau ISP yang mati sekarang?",
  "Berapa user aktif per lokasi?",
  "Site mana yang paling sering down minggu ini?",
  "Port mana yang trafiknya paling besar sekarang?",
  "Bagaimana kondisi CPU dan memori semua router?",
  "Kapan terakhir internet Jatake putus?",
];

// Nama sumber data dari backend (sebagian berakhiran periode, mis. "_7h") -> label.
const TOOL_LABELS = [
  ["get_live_status", "status live"],
  ["find_devices", "daftar perangkat"],
  ["get_network_history", "riwayat ISP & perangkat"],
  ["get_site_uptime", "uptime site"],
  ["get_downtime_log", "log downtime"],
  ["get_bandwidth_summary", "bandwidth"],
  ["profil_jaringan", "profil jaringan"],
  ["perangkat_dan_problem", "perangkat & problem"],
  ["user_dhcp_aktif", "user DHCP"],
  ["status_router", "status router"],
  ["trafik_port_live", "trafik port"],
  ["queue_tree", "queue"],
  ["riwayat_isp_perangkat", "riwayat ISP & perangkat"],
  ["uptime_site", "uptime site"],
  ["log_downtime", "log downtime"],
  ["bandwidth", "bandwidth"],
];
const toolLabel = (t) => TOOL_LABELS.find(([k]) => t.startsWith(k))?.[1] || t;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const newChat = () => ({ id: newId(), title: "", updatedAt: Date.now(), messages: [] });

function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed?.chats) && parsed.chats.length) return parsed;
  } catch { /* abaikan */ }
  const c = newChat();
  return { chats: [c], activeId: c.id };
}

function dayLabel(ts) {
  const d = dayjs(ts);
  if (d.isSame(dayjs(), "day")) return "Hari ini";
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Kemarin";
  return d.format("DD/MM/YYYY");
}

function listTime(ts) {
  const d = dayjs(ts);
  if (d.isSame(dayjs(), "day")) return d.format("HH:mm");
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Kemarin";
  return d.format("DD/MM/YY");
}

/* Format ringan ala WhatsApp: **tebal** / *tebal*, `kode`, dan baris "- " jadi "• ". */
function renderInline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const k = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <strong key={k}>{p.slice(1, -1)}</strong>;
    if (/^`[^`]+`$/.test(p)) {
      return <code key={k} style={{ fontFamily: "Consolas, monospace", fontSize: 12.5, background: "rgba(0,0,0,0.06)", padding: "0 3px", borderRadius: 3 }}>{p.slice(1, -1)}</code>;
    }
    return <Fragment key={k}>{p}</Fragment>;
  });
}

function FormattedText({ text }) {
  const lines = (text || "").split("\n");
  return lines.map((ln, i) => {
    const clean = ln.replace(/^#{1,6}\s+/, "");
    const bullet = /^\s*[-*•]\s+/.test(clean);
    const body = bullet ? clean.replace(/^\s*[-*•]\s+/, "") : clean;
    return (
      <Fragment key={i}>
        {bullet ? "• " : ""}
        {renderInline(body, i)}
        {i < lines.length - 1 && "\n"}
      </Fragment>
    );
  });
}

// Centang dua ala WhatsApp: abu-abu = terkirim, biru = sudah dijawab.
const DoubleTick = ({ color }) => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke={color} strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 6l3 3 6-7.5" />
    <path d="M6.5 8.6l.9.9 6-7.5" />
  </svg>
);

function Avatar({ size = 40, user = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: user ? NS.band : WA.teal, color: user ? WA.sub : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Stars02 width={size * 0.5} height={size * 0.5} />
    </div>
  );
}

function IconBtn({ title, onClick, children, disabled, size = 32 }) {
  return (
    <button type="button" className="wa-icon-btn" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{
        width: size, height: size, borderRadius: "50%", border: "none", background: "transparent",
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

/* Sudut gelembung: pesan pertama dalam satu rentetan punya "ekor" (sudut lancip
   di sisi pengirim), pesan lanjutan bulat penuh. */
const bubbleRadius = (mine, first) => (
  !first ? 16 : mine ? "16px 4px 16px 16px" : "4px 16px 16px 16px"
);

function Bubble({ m, onRetry, answered, first, mobile }) {
  const mine = m.role === "user";
  const [copied, setCopied] = useState(false);
  const canCopy = !mine && !m.error && navigator.clipboard;
  const copy = () => {
    navigator.clipboard.writeText(m.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  const meta = mine ? "rgba(255,255,255,0.78)" : WA.sub;
  return (
    <div className="wa-row" style={{
      display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-end",
      marginTop: first ? 8 : 2, animation: "wa-in .18s ease-out",
    }}>
      <div style={{
        position: "relative", maxWidth: mobile ? "86%" : "min(80%, 640px)", padding: "8px 12px 6px",
        borderRadius: bubbleRadius(mine, first),
        background: m.error ? "#fff1f0" : mine ? WA.mine : WA.theirs,
        border: m.error ? "1px solid #f3c5c5" : "none",
        boxShadow: mine ? "0 1px 2px rgba(20,40,77,0.25)" : "0 1px 2px rgba(20,40,77,0.12)",
        color: m.error ? "#b42318" : mine ? "#fff" : WA.text,
        fontSize: mobile ? 14.5 : 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        <FormattedText text={m.content} />
        {m.error && onRetry && (
          <div>
            <button type="button" onClick={onRetry} style={{
              marginTop: 8, border: "1px solid #f3c5c5", background: "#fff", color: "#b42318", fontWeight: 700,
              cursor: "pointer", padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center",
              gap: 5, fontSize: 12.5, fontFamily: NS.font,
            }}>
              <RefreshCw01 width={13} height={13} /> Coba lagi
            </button>
          </div>
        )}
        {m.tools?.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, whiteSpace: "normal" }}>
            {[...new Set(m.tools.map(toolLabel))].map((t) => (
              <span key={t} style={{
                fontSize: 10.5, fontWeight: 600, color: NS.link, background: "#eef3fb",
                border: "1px solid #d6e2f5", borderRadius: 999, padding: "1px 8px",
              }}>{t}</span>
            ))}
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3,
          fontSize: 10.5, color: meta, lineHeight: "14px", whiteSpace: "nowrap",
        }}>
          {canCopy && (
            <button type="button" className="wa-copy" onClick={copy} title="Salin jawaban" aria-label="Salin jawaban"
              style={{
                border: "none", background: "transparent", color: copied ? WA.green : WA.sub, cursor: "pointer",
                padding: 0, marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5,
                fontFamily: NS.font,
              }}>
              {copied ? <><Check width={12} height={12} /> Tersalin</> : <><Copy01 width={12} height={12} /> Salin</>}
            </button>
          )}
          {dayjs(m.time).format("HH:mm")}
          {mine && <DoubleTick color={answered ? "#9fd3ff" : meta} />}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", marginTop: 8, animation: "wa-in .18s ease-out" }}>
      <div style={{
        background: WA.theirs, borderRadius: bubbleRadius(false, true), boxShadow: "0 1px 2px rgba(20,40,77,0.12)",
        padding: "12px 14px", display: "flex", gap: 4,
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#8fa3bf",
            animation: `wa-typing 1.2s ${i * 0.18}s infinite ease-in-out`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* compact = mode widget melayang: selalu satu panel (seperti WhatsApp di HP).
   onClose = tombol tutup di header; onAnswer = dipanggil saat jawaban masuk
   (widget memakai ini untuk tanda pesan belum dibaca). */
export default function NetworkChat({ compact = false, onClose, onAnswer }) {
  const isMobile = useIsMobile(820) || compact;
  // Layar HP sungguhan (bukan sekadar widget sempit): target sentuh & huruf lebih besar.
  const phone = useIsMobile(560);
  const btnSize = phone ? 40 : 32;
  const [store, setStore] = useState(loadChats);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [info, setInfo] = useState(null);
  const [showList, setShowList] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const active = store.chats.find((c) => c.id === store.activeId) || store.chats[0];
  const loading = loadingId === active?.id;
  const disabled = info && !info.enabled;

  useEffect(() => {
    axios.get(`${API_BASE}/api/noc/chat/info`)
      // Balasan bukan JSON (mis. halaman HTML) = backend lama / salah alamat.
      .then((r) => setInfo(r.data && typeof r.data === "object" ? r.data : { enabled: false, offline: true }))
      .catch(() => setInfo({ enabled: false, offline: true }));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* abaikan */ }
  }, [store]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length, loading]);

  const sortedChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...store.chats]
      .filter((c) => !q || (c.title || "").toLowerCase().includes(q)
        || c.messages.some((m) => m.content.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [store.chats, search]);

  function updateChat(id, fn) {
    setStore((s) => ({ ...s, chats: s.chats.map((c) => (c.id === id ? fn(c) : c)) }));
  }

  function openChat(id) {
    setStore((s) => ({ ...s, activeId: id }));
    setShowList(false);
  }

  function startNewChat() {
    // Pakai percakapan kosong yang sudah ada daripada menumpuk yang kosong.
    const empty = store.chats.find((c) => c.messages.length === 0);
    if (empty) {
      openChat(empty.id);
    } else {
      const c = newChat();
      setStore((s) => ({ chats: [c, ...s.chats].slice(0, MAX_CHATS), activeId: c.id }));
      setShowList(false);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function deleteChat(id) {
    if (!window.confirm("Hapus percakapan ini?")) return;
    setStore((s) => {
      const rest = s.chats.filter((c) => c.id !== id);
      if (!rest.length) {
        const c = newChat();
        return { chats: [c], activeId: c.id };
      }
      return { chats: rest, activeId: s.activeId === id ? rest[0].id : s.activeId };
    });
  }

  async function ask(chatId, messages) {
    setLoadingId(chatId);
    try {
      const payload = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      const r = await axios.post(`${API_BASE}/api/noc/chat`, { messages: payload }, { timeout: 240000 });
      updateChat(chatId, (c) => ({
        ...c, updatedAt: Date.now(),
        messages: [...c.messages, { role: "assistant", content: r.data.answer, tools: r.data.tools_used, time: Date.now() }],
      }));
      onAnswer?.();
    } catch (e) {
      const detail = e.response?.data?.detail || e.message;
      updateChat(chatId, (c) => ({
        ...c, updatedAt: Date.now(),
        messages: [...c.messages, { role: "assistant", error: true, content: `Gagal: ${detail}`, time: Date.now() }],
      }));
    } finally {
      setLoadingId(null);
    }
  }

  function send(text) {
    const q = (text ?? input).trim();
    if (!q || loadingId || disabled || !active) return;
    const msg = { role: "user", content: q, time: Date.now() };
    const next = [...active.messages, msg];
    updateChat(active.id, (c) => ({ ...c, title: c.title || q.slice(0, 60), updatedAt: Date.now(), messages: next }));
    setInput("");
    ask(active.id, next);
  }

  function retry() {
    const msgs = active.messages.slice(0, -1); // buang gelembung error
    updateChat(active.id, (c) => ({ ...c, messages: msgs }));
    ask(active.id, msgs);
  }

  const listVisible = !isMobile || showList;
  const chatVisible = !isMobile || !showList;

  /* ─── panel kiri: daftar percakapan ─── */
  const listPanel = (
    <div style={{
      width: isMobile ? "100%" : 340, flexShrink: 0, display: "flex", flexDirection: "column",
      background: "#fff", borderRight: `1px solid ${WA.border}`, minHeight: 0,
    }}>
      <div style={{
        minHeight: phone ? 56 : 52, padding: "0 8px 0 16px", paddingTop: compact ? "env(safe-area-inset-top)" : 0,
        background: WA.head, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ fontSize: phone ? 16 : 14.5, fontWeight: 700, color: "#fff" }}>Tanya Jaringan</div>
        <div style={{ display: "flex" }}>
          <IconBtn size={btnSize} title="Percakapan baru" onClick={startNewChat}><Plus width={19} height={19} /></IconBtn>
          {onClose && <IconBtn size={btnSize} title="Tutup" onClick={onClose}><XClose width={19} height={19} /></IconBtn>}
        </div>
      </div>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${WA.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f1f4f8", borderRadius: 999, padding: "0 14px", height: phone ? 40 : 34 }}>
          <SearchMd width={15} height={15} color={WA.sub} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari percakapan"
            style={{ border: "none", outline: "none", background: "transparent", flex: 1, minWidth: 0, fontSize: phone ? 16 : 13.5, color: WA.text, fontFamily: NS.font }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sortedChats.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const isActive = c.id === active?.id;
          return (
            <div key={c.id} onClick={() => openChat(c.id)} className="wa-chat-row"
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 12px 0 14px", cursor: "pointer", background: isActive ? WA.active : "transparent" }}>
              <Avatar size={phone ? 42 : 36} />
              <div style={{ flex: 1, minWidth: 0, padding: phone ? "12px 0" : "10px 0", borderBottom: `1px solid ${WA.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: WA.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title || "Percakapan baru"}
                  </span>
                  <span style={{ fontSize: 11, color: WA.sub, flexShrink: 0 }}>{listTime(c.updatedAt)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ flex: 1, fontSize: 12, color: WA.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {loadingId === c.id
                      ? <span style={{ color: WA.green }}>sedang mengetik…</span>
                      : last ? `${last.role === "user" ? "Anda: " : ""}${last.content.replace(/[*#`]/g, "")}` : "Belum ada pesan"}
                  </span>
                  <button type="button" className="wa-del" title="Hapus percakapan" aria-label="Hapus percakapan"
                    onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}
                    style={{ border: "none", background: "transparent", color: WA.sub, cursor: "pointer", padding: phone ? 6 : 2, margin: phone ? -4 : 0, display: "flex" }}>
                    <Trash01 width={15} height={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!sortedChats.length && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: WA.sub }}>Tidak ada percakapan yang cocok.</div>}
      </div>
    </div>
  );

  /* ─── panel kanan: ruang chat ─── */
  let lastDay = null;
  const chatPanel = active && (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{
        minHeight: phone ? 56 : 52, padding: isMobile ? "0 6px 0 4px" : "0 16px", paddingTop: compact ? "env(safe-area-inset-top)" : 0,
        background: WA.head, display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, flexShrink: 0,
        borderLeft: isMobile ? "none" : `1px solid ${WA.border}`, boxShadow: "0 1px 4px rgba(20,40,77,0.25)", zIndex: 1,
      }}>
        {isMobile && <IconBtn size={btnSize} title="Semua percakapan" onClick={() => setShowList(true)}><ArrowLeft width={19} height={19} /></IconBtn>}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Avatar size={phone ? 36 : 32} />
          {info?.enabled && (
            <span style={{
              position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: "50%",
              background: "#3ccf6e", border: "2px solid #1d3a6e",
            }} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1, marginLeft: 4 }}>
          <div style={{ fontSize: phone ? 15 : 14, color: "#fff", fontWeight: 700, lineHeight: 1.25 }}>Hermes NOC</div>
          <div style={{ fontSize: 11.5, color: loading ? "#9fe0a8" : "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {loading ? "sedang mengetik…" : disabled ? (info.offline ? "backend tidak terhubung" : "belum aktif") : info ? (compact ? "online" : "online · membaca seluruh data jaringan") : "menghubungkan…"}
          </div>
        </div>
        <IconBtn size={btnSize} title="Percakapan baru" onClick={startNewChat}><Plus width={19} height={19} /></IconBtn>
        {onClose && <IconBtn size={btnSize} title="Tutup" onClick={onClose}><XClose width={19} height={19} /></IconBtn>}
      </div>

      <div className="wa-wall" style={{
        flex: 1, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch",
        padding: isMobile ? "10px 12px 14px" : "16px 7%",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          alignSelf: "center", maxWidth: 520, margin: "4px 8px 6px", padding: "7px 12px", background: "#fffaeb",
          border: "1px solid #f3e2a9", borderRadius: 10, fontSize: 11.5, lineHeight: 1.45, color: NS.warn, textAlign: "center",
        }}>
          🔒 Asisten AI ini membaca data jaringan langsung (Zabbix, MikroTik, Netwatch) dan hanya membaca, tidak bisa mengubah konfigurasi.
        </div>

        {disabled && (
          <div style={{ alignSelf: "center", margin: "8px 0", padding: "8px 14px", background: "#fff1f0", border: "1px solid #f3c5c5", borderRadius: 10, fontSize: 12.5, color: "#b42318", textAlign: "center" }}>
            {info.offline ? "Backend tidak bisa dihubungi." : "Chat AI belum aktif: isi HERMES_BASE_URL dan HERMES_MODEL di backend/app/.env lalu restart backend."}
          </div>
        )}

        {active.messages.length === 0 && !disabled && (
          <div style={{ alignSelf: "center", width: "100%", maxWidth: 560, marginTop: phone ? 16 : 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Avatar size={phone ? 56 : 48} />
              <div style={{ fontSize: phone ? 16 : 14.5, fontWeight: 700, color: WA.text }}>Halo! Mau cek apa hari ini?</div>
              <div style={{ fontSize: 12.5, color: WA.sub, textAlign: "center" }}>Pilih contoh pertanyaan atau ketik sendiri.</div>
            </div>
            <div style={{ display: "flex", flexDirection: phone || compact ? "column" : "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="wa-sugg" onClick={() => send(s)} disabled={!!loadingId}
                  style={{
                    border: "1px solid #d6e2f5", background: "#fff", color: NS.link,
                    borderRadius: phone || compact ? 12 : 999, textAlign: "left",
                    padding: phone ? "11px 14px" : "7px 12px", fontSize: phone ? 14 : 12.5, fontWeight: 500,
                    cursor: "pointer", fontFamily: NS.font, boxShadow: "0 1px 2px rgba(20,40,77,0.06)",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {active.messages.map((m, i) => {
          const day = dayLabel(m.time || Date.now());
          const sep = day !== lastDay;
          lastDay = day;
          const isLast = i === active.messages.length - 1;
          const first = sep || i === 0 || active.messages[i - 1].role !== m.role;
          const answered = m.role === "user" && active.messages.slice(i + 1).some((x) => x.role === "assistant" && !x.error);
          return (
            <Fragment key={i}>
              {sep && (
                <div style={{
                  position: "sticky", top: 0, zIndex: 1, alignSelf: "center", margin: "10px 0 2px", padding: "4px 12px",
                  background: "rgba(255,255,255,0.92)", borderRadius: 999, fontSize: 11, fontWeight: 600, color: NS.bandText,
                  boxShadow: "0 1px 2px rgba(20,40,77,0.12)",
                }}>
                  {day}
                </div>
              )}
              <Bubble m={m} first={first} mobile={phone} answered={answered} onRetry={m.error && isLast && !loadingId ? retry : null} />
            </Fragment>
          );
        })}
        {loading && <TypingBubble />}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{
          padding: phone ? "8px 8px" : "8px 10px",
          paddingBottom: compact ? "calc(8px + env(safe-area-inset-bottom))" : 8,
          background: "#f6f8fb", borderTop: `1px solid ${WA.border}`, display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0,
        }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Di HP, Enter = baris baru (kirim lewat tombol), seperti WhatsApp.
            if (e.key === "Enter" && !e.shiftKey && !phone) { e.preventDefault(); send(); }
          }}
          placeholder={disabled ? "Chat belum aktif" : "Ketik pesan"}
          disabled={disabled}
          enterKeyHint={phone ? "enter" : "send"}
          className="wa-input"
          style={{
            flex: 1, minWidth: 0, resize: "none", border: `1px solid ${WA.border}`, outline: "none", borderRadius: 22,
            padding: phone ? "10px 16px" : "8px 14px", minHeight: phone ? 44 : 36, boxSizing: "border-box",
            // 16px di HP supaya iOS tidak auto-zoom saat input difokus.
            fontSize: phone ? 16 : 13.5, lineHeight: 1.4, maxHeight: 140, fontFamily: NS.font, color: WA.text, background: "#fff",
            fieldSizing: "content",
          }}
        />
        <button type="submit" title="Kirim" aria-label="Kirim" disabled={!input.trim() || !!loadingId || disabled}
          className="wa-send"
          style={{
            width: phone ? 44 : 36, height: phone ? 44 : 36, borderRadius: "50%", border: "none", flexShrink: 0,
            background: input.trim() && !loadingId && !disabled ? WA.teal : "#c3ccd9", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: input.trim() && !loadingId && !disabled ? "0 2px 6px rgba(42,93,176,0.4)" : "none",
            cursor: input.trim() && !loadingId && !disabled ? "pointer" : "default",
            transition: "background .15s, transform .1s",
          }}>
          <Send01 width={phone ? 19 : 16} height={phone ? 19 : 16} />
        </button>
      </form>
    </div>
  );

  return (
    <div style={compact ? {
      display: "flex", height: "100%", background: "#fff", overflow: "hidden", fontFamily: NS.font,
    } : {
      display: "flex", height: isMobile ? "calc(100vh - 120px)" : "calc(100vh - 150px)", minHeight: 480,
      background: "#fff", borderRadius: 4, overflow: "hidden", fontFamily: NS.font,
      boxShadow: "0 1px 3px rgba(11,20,26,0.15)",
    }}>
      <style>{`
        @keyframes wa-typing { 0%, 60%, 100% { transform: translateY(0); opacity: .5 } 30% { transform: translateY(-4px); opacity: 1 } }
        @keyframes wa-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .wa-wall {
          background-color: ${WA.wall};
          background-image: radial-gradient(rgba(42,93,176,0.07) 1px, transparent 1px);
          background-size: 18px 18px;
        }
        .wa-icon-btn:hover { background: rgba(255,255,255,0.14) !important; }
        .wa-icon-btn:active { background: rgba(255,255,255,0.22) !important; }
        .wa-sugg:hover { background: #f3f7fd !important; border-color: #b9cdee !important; }
        .wa-sugg:active { transform: scale(.98); }
        .wa-input:focus { border-color: #8fb0e3 !important; box-shadow: 0 0 0 3px rgba(42,93,176,0.12); }
        .wa-send:active:not(:disabled) { transform: scale(.92); }
        .wa-row .wa-copy { opacity: 0; transition: opacity .15s; }
        .wa-row:hover .wa-copy { opacity: 1; }
        @media (hover: none) { .wa-row .wa-copy { opacity: 1; } }
        .wa-chat-row:hover { background: ${WA.active} !important; }
        .wa-chat-row .wa-del { opacity: 0; }
        .wa-chat-row:hover .wa-del { opacity: 1; }
        @media (hover: none) { .wa-chat-row .wa-del { opacity: 1; } }
      `}</style>
      {listVisible && listPanel}
      {chatVisible && chatPanel}
    </div>
  );
}
