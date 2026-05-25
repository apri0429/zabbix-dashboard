import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../api";

const T = {
  navy:     "#1a2a57",
  navyMid:  "#2d4a8c",
  teal:     "#2a9d8f",
  coral:    "#e76f51",
  gold:     "#e9c46a",
  text:     "#0f2035",
  textSoft: "#425575",
  muted:    "#5a6b88",
  border:   "rgba(26,42,87,0.10)",
  borderMid:"rgba(26,42,87,0.18)",
  surface:  "#ffffff",
  surfaceAlt:"rgba(248,249,250,0.95)",
};

function useBreakpoint() {
  const get = () => ({ isMobile: window.innerWidth < 640 });
  const [bp, setBp] = useState(() => typeof window !== "undefined" ? get() : { isMobile: false });
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
}

/* ─── Helpers ─── */
function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function parseUptime(uptime) {
  if (!uptime) return { text: "–", days: 0, hours: 0, minutes: 0 };
  // MikroTik uptime format: "3d14h22m35s" or "1w2d5h10m3s"
  const weeks   = parseInt(uptime.match(/(\d+)w/)?.[1] || 0);
  const days    = parseInt(uptime.match(/(\d+)d/)?.[1] || 0);
  const hours   = parseInt(uptime.match(/(\d+)h/)?.[1] || 0);
  const minutes = parseInt(uptime.match(/(\d+)m/)?.[1] || 0);
  const totalDays = weeks * 7 + days;
  const parts = [];
  if (totalDays > 0) parts.push(`${totalDays}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return { text: parts.join(" ") || "< 1m", days: totalDays, hours, minutes };
}

/* ─── Sub-components ─── */
const OnlineBadge = ({ online }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "3px 10px", borderRadius: 99,
    fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
    color: online ? "#18786e" : "#b42318",
    background: online ? "rgba(42,157,143,0.13)" : "rgba(231,111,81,0.12)",
    border: `1px solid ${online ? "rgba(42,157,143,0.28)" : "rgba(231,111,81,0.28)"}`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: online ? "#18786e" : "#b42318", display: "inline-block" }} />
    {online ? "Online" : "Offline"}
  </span>
);

function CpuGauge({ value }) {
  const color = value > 80 ? "#b42318" : value > 60 ? "#8a680f" : "#18786e";
  const bg    = value > 80 ? "rgba(231,111,81,0.10)" : value > 60 ? "rgba(233,196,106,0.15)" : "rgba(42,157,143,0.08)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>CPU Load</span>
        <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "-0.02em" }}>{value}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "rgba(26,42,87,0.07)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function MemBar({ used, total }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 85 ? "#b42318" : pct > 65 ? "#8a680f" : T.navyMid;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Memory</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>
          {formatBytes(used)} / {formatBytes(total)}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "rgba(26,42,87,0.07)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function RouterCard({ router, isMobile }) {
  const uptime = parseUptime(router.uptime);
  return (
    <div style={{
      borderRadius: 16, border: `1px solid ${router.online ? T.border : "rgba(231,111,81,0.22)"}`,
      background: T.surface, overflow: "hidden",
      boxShadow: router.online ? "0 2px 8px rgba(26,42,87,0.07)" : "0 2px 8px rgba(231,111,81,0.08)",
      opacity: router.online ? 1 : 0.82,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 12px",
        background: router.online ? "rgba(26,42,87,0.03)" : "rgba(231,111,81,0.04)",
        borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {router.router_name}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>
            {router.router_host}
          </div>
        </div>
        <OnlineBadge online={router.online} />
      </div>

      {router.online ? (
        <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <CpuGauge value={router.cpu_load} />
          <MemBar used={router.used_memory} total={router.total_memory} />

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 2 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Uptime</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.navy, fontFamily: "'IBM Plex Mono',monospace" }}>
                {uptime.text}
              </div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Board</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {router.board_name || "–"}
              </div>
            </div>
          </div>

          {router.version && (
            <div style={{ fontSize: 11, color: T.muted, fontFamily: "'IBM Plex Mono',monospace", textAlign: "right" }}>
              RouterOS {router.version}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="rgba(231,111,81,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p style={{ margin: 0, fontSize: 12, color: "#b42318", fontWeight: 600, textAlign: "center" }}>Tidak dapat terhubung</p>
          {router.error && (
            <p style={{ margin: 0, fontSize: 11, color: T.muted, textAlign: "center", lineHeight: 1.5 }}>
              {router.error.length > 90 ? router.error.slice(0, 90) + "…" : router.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function MikrotikStatus() {
  const { isMobile } = useBreakpoint();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(30);

  const REFRESH_INTERVAL = 30;

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE}/api/mikrotik/status`, { timeout: 30000 });
      setData(res.data.data || []);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Gagal mengambil data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchStatus();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const onlineCount  = data.filter(r => r.online).length;
  const offlineCount = data.filter(r => !r.online).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, width: "100%" }}>

      {/* Loading bar */}
      {loading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: `linear-gradient(90deg,${T.navy},${T.navyMid},${T.teal})`, animation: "mt-progress 1.6s ease-in-out infinite", transformOrigin: "left center" }}>
          <style>{`@keyframes mt-progress { 0%{transform:scaleX(0) translateX(0)} 50%{transform:scaleX(0.6) translateX(50%)} 100%{transform:scaleX(0) translateX(200%)} }`}</style>
        </div>
      )}

      {/* Header panel */}
      <div className="dashboard-panel" style={{ padding: isMobile ? 16 : 22 }}>
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: T.text, letterSpacing: "-0.025em" }}>
              Status MikroTik
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.muted }}>
              CPU, uptime, dan status koneksi per router — refresh otomatis tiap {REFRESH_INTERVAL}s
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: T.muted, fontFamily: "'IBM Plex Mono',monospace" }}>
                {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={fetchStatus}
              disabled={loading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
                background: loading ? "rgba(26,42,87,0.05)" : "rgba(26,42,87,0.08)",
                border: `1px solid ${T.borderMid}`, color: T.navy,
                opacity: loading ? 0.6 : 1, transition: "background 0.15s",
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: loading ? "mt-spin 0.8s linear infinite" : "none" }}>
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              <style>{`@keyframes mt-spin { to { transform: rotate(360deg); } }`}</style>
              {loading ? "Refreshing…" : `Refresh (${countdown}s)`}
            </button>
          </div>
        </div>

        {/* Summary chips */}
        {data.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "rgba(26,42,87,0.07)", border: `1px solid ${T.borderMid}`, color: T.navy }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.navy, display: "inline-block" }} />
              {data.length} Router
            </span>
            {onlineCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "rgba(42,157,143,0.10)", border: "1px solid rgba(42,157,143,0.25)", color: "#18786e" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#18786e", display: "inline-block" }} />
                {onlineCount} Online
              </span>
            )}
            {offlineCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "rgba(231,111,81,0.10)", border: "1px solid rgba(231,111,81,0.25)", color: "#b42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#b42318", display: "inline-block" }} />
                {offlineCount} Offline
              </span>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(231,111,81,0.08)", border: "1px solid rgba(231,111,81,0.22)", color: "#b42318", fontSize: 13, display: "flex", gap: 9, fontWeight: 500 }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data.length === 0 && (
        <div className="dashboard-panel" style={{ padding: "48px 24px", textAlign: "center" }}>
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="rgba(26,42,87,0.25)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
            <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          <p style={{ margin: 0, color: T.muted, fontSize: 13 }}>Tidak ada router yang terkonfigurasi.</p>
          <p style={{ margin: "4px 0 0", color: T.muted, fontSize: 12 }}>Tambahkan konfigurasi MIKROTIK_x di file .env</p>
        </div>
      )}

      {/* Router cards grid */}
      {data.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
          gap: isMobile ? 12 : 16,
        }}>
          {data.map((router) => (
            <RouterCard key={router.router_id} router={router} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
}
