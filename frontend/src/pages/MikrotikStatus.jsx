import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../api";
import { RefreshCw01 } from "@untitledui/icons";
import { NS, PageHeader, Panel, Alert, btn, th, td, zebraRow, useIsMobile } from "../components/ns";

const T = {
  navy:     "#24385b",
  navyMid:  "#2a5db0",
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
const loadColor = (pct) => (pct > 85 ? NS.bad : pct > 65 ? NS.warn : NS.ok);

const StatusText = ({ online }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: online ? NS.ok : NS.bad }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? NS.ok : NS.bad }} />
    {online ? "Online" : "Offline"}
  </span>
);

/* Bar pemakaian kecil: angka persen + batang berwarna sesuai beban. */
const MiniBar = ({ pct, detail }) => {
  const color = loadColor(pct);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 3, background: NS.colHead, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, transition: "width 0.6s ease" }} />
        </div>
        <span style={{ minWidth: 36, textAlign: "right", fontWeight: 700, color }}>{pct}%</span>
      </div>
      {detail && <div style={{ fontSize: 11.5, color: NS.label, marginTop: 3 }}>{detail}</div>}
    </div>
  );
};

/* Tampilan HP: satu blok per router, isi sama dengan baris tabel. */
function RouterItem({ r, i }) {
  const memPct = r.total_memory > 0 ? Math.round((r.used_memory / r.total_memory) * 100) : 0;
  const meta = [
    ["Uptime", r.online ? parseUptime(r.uptime).text : "–"],
    ["Board", r.board_name || "–"],
    ["RouterOS", r.version || "–"],
  ];
  return (
    <div style={{ padding: "12px 14px", background: i % 2 ? NS.zebra : NS.surface, borderTop: i ? `1px solid ${NS.colHead}` : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{r.router_name}</div>
          <div style={{ fontSize: 12, color: NS.label }}>{r.router_host}</div>
        </div>
        <StatusText online={r.online} />
      </div>
      {r.online ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", marginBottom: 4 }}>CPU</div>
              <MiniBar pct={Number(r.cpu_load) || 0} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: NS.label, textTransform: "uppercase", marginBottom: 4 }}>Memory</div>
              <MiniBar pct={memPct} detail={`${formatBytes(r.used_memory)} / ${formatBytes(r.total_memory)}`} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            {meta.map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: NS.label }}>{k}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: "anywhere" }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      ) : r.error && (
        <div style={{ fontSize: 12, color: NS.label, marginTop: 6 }}>{r.error.length > 90 ? r.error.slice(0, 90) + "…" : r.error}</div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function MikrotikStatus() {
  const isMobile = useIsMobile();
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
      setError(err?.response?.data?.detail || err?.message || "Failed to fetch data.");
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
  const onlineRouters = data.filter((r) => r.online);
  const avgCpu = onlineRouters.length
    ? Math.round(onlineRouters.reduce((sum, r) => sum + (Number(r.cpu_load) || 0), 0) / onlineRouters.length)
    : 0;

  const timeText = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", fontFamily: NS.font, color: NS.text }}>
      <PageHeader
        title="MikroTik"
        subtitle={`${data.length ? `${onlineCount}/${data.length} routers online${offlineCount ? ` · ${offlineCount} offline` : ""} · avg CPU ${avgCpu}% · ` : ""}${loading ? "updating…" : `updated ${timeText}`}`}
        actions={
          <button type="button" onClick={fetchStatus} disabled={loading} style={{ ...btn(false, loading), gap: 8, width: isMobile ? "100%" : "auto" }} title="Refresh now">
            <RefreshCw01 width={14} height={14} />
            {loading ? "Refreshing…" : `Refresh · auto in ${countdown}s`}
          </button>
        }
      />

      {error && <Alert tone="bad" title="Unable to load data">{error}</Alert>}

      {!loading && !error && data.length === 0 && (
        <Alert tone="info" title="No routers configured">
          Add the MIKROTIK_x settings to the .env file.
        </Alert>
      )}

      {data.length > 0 && (
        <Panel title="Router Overview" right={`${onlineCount}/${data.length} online`}>
          {isMobile ? data.map((r, i) => <RouterItem key={r.router_id} r={r} i={i} />) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>{["Router", "Status", "CPU", "Memory", "Uptime", "Board", "RouterOS"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.map((r, i) => {
                  const memPct = r.total_memory > 0 ? Math.round((r.used_memory / r.total_memory) * 100) : 0;
                  const dash = <span style={{ color: NS.muted }}>–</span>;
                  return (
                    <tr key={r.router_id} style={zebraRow(i, false)}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {r.router_name}
                        <div style={{ fontSize: 12, color: NS.label, fontWeight: 400 }}>{r.router_host}</div>
                      </td>
                      <td style={td}>
                        <StatusText online={r.online} />
                        {!r.online && r.error && (
                          <div style={{ fontSize: 11.5, color: NS.label, marginTop: 3, maxWidth: 220 }}>
                            {r.error.length > 70 ? r.error.slice(0, 70) + "…" : r.error}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, minWidth: 150 }}>{r.online ? <MiniBar pct={Number(r.cpu_load) || 0} /> : dash}</td>
                      <td style={{ ...td, minWidth: 170 }}>
                        {r.online ? <MiniBar pct={memPct} detail={`${formatBytes(r.used_memory)} / ${formatBytes(r.total_memory)}`} /> : dash}
                      </td>
                      <td style={td}>{r.online ? parseUptime(r.uptime).text : "–"}</td>
                      <td style={td}>{r.board_name || "–"}</td>
                      <td style={td}>{r.version || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </Panel>
      )}
    </div>
  );
}
