import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";
import {
  Send01, Plus, SearchMd, Trash01, ArrowLeft, Stars02, RefreshCw01, XClose,
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
  mine: NS.infoBg,
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

function IconBtn({ title, onClick, children, disabled }) {
  return (
    <button type="button" className="wa-icon-btn" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 3, border: "none", background: "transparent",
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

function Bubble({ m, onRetry, answered }) {
  const mine = m.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", padding: "1px 0" }}>
      <div style={{
        position: "relative", maxWidth: "min(82%, 640px)", padding: "6px 9px 7px",
        borderRadius: 4, border: `1px solid ${m.error ? "#f3c5c5" : mine ? "#b9cdee" : WA.border}`,
        background: m.error ? "#ffe9e9" : mine ? WA.mine : WA.theirs,
        color: WA.text,
        fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        <FormattedText text={m.content} />
        {m.error && onRetry && (
          <div>
            <button type="button" onClick={onRetry} style={{
              marginTop: 6, border: "none", background: "transparent", color: WA.teal, fontWeight: 700,
              cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13,
            }}>
              <RefreshCw01 width={13} height={13} /> Coba lagi
            </button>
          </div>
        )}
        {m.tools?.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: WA.sub, whiteSpace: "normal" }}>
            Data: {[...new Set(m.tools.map(toolLabel))].join(", ")}
          </div>
        )}
        <span style={{
          float: "right", marginLeft: 10, marginTop: 4, marginBottom: -4, fontSize: 11, color: WA.sub,
          display: "inline-flex", alignItems: "center", gap: 3, lineHeight: "15px",
        }}>
          {dayjs(m.time).format("HH:mm")}
          {mine && <DoubleTick color={answered ? WA.tick : WA.sub} />}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", padding: "1px 0" }}>
      <div style={{
        background: WA.theirs, borderRadius: 4, border: `1px solid ${WA.border}`, padding: "9px 12px", display: "flex", gap: 4,
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#8696a0",
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
      <div style={{ height: 48, padding: "0 8px 0 14px", background: WA.head, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Tanya Jaringan</div>
        <div style={{ display: "flex" }}>
          <IconBtn title="Percakapan baru" onClick={startNewChat}><Plus width={18} height={18} /></IconBtn>
          {onClose && <IconBtn title="Tutup" onClick={onClose}><XClose width={18} height={18} /></IconBtn>}
        </div>
      </div>
      <div style={{ padding: "7px 12px", borderBottom: `1px solid ${WA.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${NS.field}`, borderRadius: 3, padding: "0 10px", height: 30 }}>
          <SearchMd width={15} height={15} color={WA.sub} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari percakapan"
            style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13.5, color: WA.text, fontFamily: NS.font }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sortedChats.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const isActive = c.id === active?.id;
          return (
            <div key={c.id} onClick={() => openChat(c.id)} className="wa-chat-row"
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 12px 0 14px", cursor: "pointer", background: isActive ? WA.active : "transparent" }}>
              <Avatar size={34} />
              <div style={{ flex: 1, minWidth: 0, padding: "9px 0", borderBottom: `1px solid ${WA.border}` }}>
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
                    style={{ border: "none", background: "transparent", color: WA.sub, cursor: "pointer", padding: 2, display: "flex" }}>
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
      <div style={{ height: 48, padding: isMobile ? "0 6px 0 4px" : "0 16px", background: WA.head, display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, borderLeft: isMobile ? "none" : `1px solid ${WA.border}` }}>
        {isMobile && <IconBtn title="Semua percakapan" onClick={() => setShowList(true)}><ArrowLeft width={18} height={18} /></IconBtn>}
        <Avatar size={30} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, color: "#fff", fontWeight: 700 }}>Hermes NOC</div>
          <div style={{ fontSize: 11, color: loading ? "#9fe0a8" : "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {loading ? "sedang mengetik…" : disabled ? (info.offline ? "backend tidak terhubung" : "belum aktif") : info ? (compact ? "online" : "online · membaca seluruh data jaringan") : "menghubungkan…"}
          </div>
        </div>
        <IconBtn title="Percakapan baru" onClick={startNewChat}><Plus width={18} height={18} /></IconBtn>
        {onClose && <IconBtn title="Tutup" onClick={onClose}><XClose width={18} height={18} /></IconBtn>}
      </div>

      <div style={{
        flex: 1, overflowY: "auto", padding: isMobile ? "10px" : "16px 7%", background: WA.wall,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ alignSelf: "center", maxWidth: 520, margin: "4px 0 10px", padding: "6px 10px", background: NS.warnBg, border: "1px solid #ecd9a0", borderRadius: 3, fontSize: 11.5, color: NS.warn, textAlign: "center" }}>
          Asisten AI ini membaca data jaringan langsung (Zabbix, MikroTik, Netwatch) dan hanya membaca, tidak bisa mengubah konfigurasi.
        </div>

        {disabled && (
          <div style={{ alignSelf: "center", padding: "8px 14px", background: "#ffe9e9", borderRadius: 3, fontSize: 12.5, color: "#b42318" }}>
            {info.offline ? "Backend tidak bisa dihubungi." : "Chat AI belum aktif: isi HERMES_BASE_URL dan HERMES_MODEL di backend/app/.env lalu restart backend."}
          </div>
        )}

        {active.messages.length === 0 && !disabled && (
          <div style={{ alignSelf: "center", width: "100%", maxWidth: 560, marginTop: 8 }}>
            <div style={{ textAlign: "center", fontSize: 13, color: WA.sub, marginBottom: 10 }}>Coba tanyakan:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} disabled={!!loadingId}
                  style={{
                    border: "1px solid #b9cdee", background: "#fff", color: NS.link, borderRadius: 3,
                    padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: NS.font,
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
          const answered = m.role === "user" && active.messages.slice(i + 1).some((x) => x.role === "assistant" && !x.error);
          return (
            <Fragment key={i}>
              {sep && (
                <div style={{ alignSelf: "center", margin: "8px 0", padding: "3px 10px", background: NS.band, borderRadius: 3, fontSize: 11, fontWeight: 600, color: NS.bandText }}>
                  {day}
                </div>
              )}
              <Bubble m={m} answered={answered} onRetry={m.error && isLast && !loadingId ? retry : null} />
            </Fragment>
          );
        })}
        {loading && <TypingBubble />}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ padding: "8px 10px", background: "#fff", borderTop: `1px solid ${WA.border}`, display: "flex", alignItems: "flex-end", gap: 8 }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={disabled ? "Chat belum aktif" : "Ketik pesan"}
          disabled={disabled}
          style={{
            flex: 1, resize: "none", border: `1px solid ${NS.field}`, outline: "none", borderRadius: 3, padding: "7px 10px",
            fontSize: 13, lineHeight: 1.4, maxHeight: 120, fontFamily: NS.font, color: WA.text, background: "#fff",
            fieldSizing: "content",
          }}
        />
        <button type="submit" title="Kirim" aria-label="Kirim" disabled={!input.trim() || !!loadingId || disabled}
          style={{
            width: 34, height: 34, borderRadius: 3, border: "none", flexShrink: 0,
            background: input.trim() && !loadingId && !disabled ? WA.teal : "#b2b2b2", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: input.trim() && !loadingId && !disabled ? "pointer" : "default",
          }}>
          <Send01 width={16} height={16} />
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
        .wa-icon-btn:hover { background: rgba(255,255,255,0.14) !important; }
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
