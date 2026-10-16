/* ─────────────────────────────────────────────────────────────
   Ringkasan eksekutif untuk Dashboard: menggabungkan data NOC live,
   catatan gangguan, status router MikroTik, dan jumlah pengguna jadi
   satu gambaran kondisi jaringan perusahaan.
   ───────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Globe01, Server04, Users01, AlertCircle, CheckCircle, Clock, ArrowRight } from "@untitledui/icons";
import { API_BASE } from "../api";
import { NS, Panel, Alert, Kpi, MItem, MFacts, btn, th, td, zebraRow, useIsMobile } from "./ns";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad = (n) => String(n).padStart(2, "0");
const parseTs = (s) => (s ? new Date(String(s).replace(" ", "T")) : null);
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const shortLabel = (s = "") => s.replace(/Mikrotik\s*/i, "").replace(" - ", " / ").trim();

function fmtDur(sec) {
  if (sec == null) return "–";
  if (sec < 60) return `${sec} detik`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} jam ${m % 60} mnt` : `${h} jam`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} hari ${h % 24} jam` : `${d} hari`;
}

const pctText = (p) => (p == null ? "–" : `${Number(p).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`);
const uptimeColor = (p) => (p == null ? NS.label : p >= 99.9 ? NS.ok : p >= 99 ? NS.warn : NS.bad);
const loadColor = (pct) => (pct > 85 ? NS.bad : pct > 65 ? NS.warn : NS.ok);
const STATE_TEXT = { UP: ["Normal", NS.ok], WARN: ["Terganggu", NS.warn], DOWN: ["Mati", NS.bad], UNKNOWN: ["Tidak ada data", NS.label] };

// Pindah halaman tanpa reload (sama seperti menu atas).
function go(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
  }
}

const StateText = ({ state }) => {
  const [label, color] = STATE_TEXT[state] || STATE_TEXT.UNKNOWN;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, color, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{label}
    </span>
  );
};

const Bar = ({ pct, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ flex: 1, minWidth: 50, height: 6, borderRadius: 3, background: NS.colHead, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct || 0, 100)}%`, background: color }} />
    </div>
    <span style={{ minWidth: 38, textAlign: "right", fontWeight: 600 }}>{pct == null ? "–" : `${Math.round(pct)}%`}</span>
  </div>
);

const LinkBtn = ({ to, children }) => (
  <button type="button" className="ns-linkbtn" onClick={() => go(to)}>
    {children}
    <ArrowRight width={14} height={14} />
  </button>
);

const Empty = ({ children }) => (
  <div style={{ padding: "20px 12px", textAlign: "center", color: NS.label, fontSize: 13 }}>{children}</div>
);

export default function Overview() {
  const isMobile = useIsMobile();
  const [live, setLive] = useState(null);
  const [net, setNet] = useState(null);
  const [routers, setRouters] = useState(null);
  const [failed, setFailed] = useState({});
  const [hover, setHover] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);

  const fetchJson = useCallback(async (key, path, setter) => {
    try {
      const { data } = await axios.get(`${API_BASE}${path}`, { timeout: 30000 });
      setter(data);
      setFailed((f) => ({ ...f, [key]: false }));
    } catch {
      setFailed((f) => ({ ...f, [key]: true }));
    }
  }, []);

  const loadLive = useCallback(
    () => fetchJson("live", "/api/noc/live", (d) => { setLive(d); setCheckedAt(new Date()); }),
    [fetchJson],
  );

  // Kondisi live dicek tiap 10 detik (backend sendiri menyegarkan data dari Zabbix
  // tiap ±40 detik), status router tiap 30 detik, ringkasan 7 hari tiap 2 menit.
  // Saat tab browser tidak sedang dilihat, pengecekan dilewati supaya hemat.
  useEffect(() => {
    const visible = () => typeof document === "undefined" || !document.hidden;
    const loadRouters = () => fetchJson("routers", "/api/mikrotik/status", (d) => setRouters(d?.data || []));
    const loadNet = () => fetchJson("net", "/api/noc/network?days=7", setNet);
    loadLive();
    loadRouters();
    loadNet();
    const t1 = setInterval(() => visible() && loadLive(), 10000);
    const t2 = setInterval(() => visible() && loadRouters(), 30000);
    const t3 = setInterval(() => visible() && loadNet(), 120000);
    const onShow = () => visible() && loadLive();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t1); clearInterval(t2); clearInterval(t3);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [fetchJson, loadLive]);

  const sites = live?.sites || [];
  const devices = live?.devices || [];
  const dc = live?.device_counts || {};
  const sc = live?.counts || {};

  // Ringkasan 7 hari dari catatan gangguan.
  const week = useMemo(() => {
    const ents = (net?.entities || []).filter((e) => e.state !== "INACTIVE");
    const ups = ents.filter((e) => e.uptime_pct != null);
    return {
      avgUptime: ups.length ? ups.reduce((s, e) => s + e.uptime_pct, 0) / ups.length : null,
      incidents: ents.reduce((s, e) => s + (e.incidents || 0), 0),
      downSeconds: ents.reduce((s, e) => s + (e.downtime_seconds || 0), 0),
      worst: ents.filter((e) => e.incidents > 0).sort((a, b) => b.downtime_seconds - a.downtime_seconds).slice(0, 5),
      recent: [...(net?.incidents || [])].sort((a, b) => String(b.down_at).localeCompare(String(a.down_at))).slice(0, 6),
      coverage: net?.coverage?.coverage_pct,
    };
  }, [net]);

  // Ringkasan per lokasi: router + perangkat + pengguna.
  const locations = useMemo(() => {
    const names = new Set([...(routers || []).map((r) => r.router_name), ...devices.map((d) => d.router_name), ...Object.keys(live?.clients || {})]);
    return [...names].filter(Boolean).map((name) => {
      const r = (routers || []).find((x) => x.router_name === name);
      const list = devices.filter((d) => d.router_name === name);
      return {
        name,
        router: r,
        memPct: r && r.total_memory > 0 ? (r.used_memory / r.total_memory) * 100 : null,
        devUp: list.filter((d) => d.state === "UP").length,
        devDown: list.filter((d) => d.state === "DOWN").length,
        devTotal: list.length,
        clients: live?.clients?.[name] ?? null,
      };
    });
  }, [routers, devices, live]);

  const downSites = sites.filter((s) => s.state === "DOWN");
  const downDevices = devices.filter((d) => d.state === "DOWN");
  const offlineRouters = (routers || []).filter((r) => !r.online);
  const downNames = new Set(downDevices.map((d) => String(d.name || "").toLowerCase()));
  const problems = (live?.problems || []).filter((p) => !downNames.has(String(p.host || "").toLowerCase()));
  const issues = downSites.length + downDevices.length + offlineRouters.length + problems.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Kondisi saat ini ── */}
      {live && (
        issues === 0 ? (
          <Alert tone="ok" title="Semua jaringan berjalan normal">
            {sc.up}/{sc.total} koneksi internet aktif, {dc.up}/{dc.total} perangkat online, {live.clients_total ?? 0} pengguna terhubung.
            {week.incidents > 0 && <> Dalam 7 hari terakhir tercatat {week.incidents} kali gangguan (total {fmtDur(week.downSeconds)}).</>}
          </Alert>
        ) : (
          <Alert tone="bad" title={`${issues} masalah perlu perhatian`}>
            {downSites.map((s) => (
              <div key={s.label}>Koneksi internet <b>{shortLabel(s.label)}</b> mati{s.since ? ` sejak pukul ${clock(parseTs(s.since))}` : ""}.</div>
            ))}
            {offlineRouters.map((r) => <div key={r.router_id}>Router <b>{r.router_name}</b> tidak dapat dihubungi.</div>)}
            {downDevices.slice(0, 5).map((d) => (
              <div key={`${d.router_name}-${d.host}`}>
                Perangkat <b>{d.name}</b> ({d.router_name}) mati{d.since ? ` sejak pukul ${clock(parseTs(d.since))}` : ""}.
              </div>
            ))}
            {downDevices.length > 5 && <div>…dan {downDevices.length - 5} perangkat lain.</div>}
            {problems.slice(0, 5).map((p) => (
              <div key={p.eventid}>
                Peringatan Zabbix ({p.severity_label}): <b>{p.name}</b>{p.host ? ` di ${shortLabel(p.host)}` : ""}.
              </div>
            ))}
            <div style={{ marginTop: 6 }}><button onClick={() => document.getElementById("perangkat")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ ...btn(false), minHeight: 24, padding: "2px 10px", fontSize: 12 }}>Lihat daftar perangkat</button></div>
          </Alert>
        )
      )}
      {failed.live && !live && (
        <Alert tone="bad" title="Data kondisi jaringan belum bisa dimuat">Pastikan backend berjalan, lalu muat ulang halaman.</Alert>
      )}

      {live?.generated_at && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12, color: NS.label, marginBottom: -6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: failed.live ? NS.bad : NS.ok }}>
            <span className="ns-live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: failed.live ? NS.bad : NS.ok }} />
            {failed.live ? "Koneksi ke server terputus" : "Live"}
          </span>
          <span>
            Data per pukul {live.generated_at.slice(11, 19)}
            {checkedAt && ` · dicek ${pad(checkedAt.getHours())}:${pad(checkedAt.getMinutes())}:${pad(checkedAt.getSeconds())}`}
            {" "}· otomatis tiap 10 detik
          </span>
          <button onClick={loadLive} style={{ border: "none", background: "none", padding: 0, color: NS.link, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Perbarui sekarang
          </button>
        </div>
      )}

      {/* ── Angka utama ── */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, minmax(0, 1fr))" }}>
        <Kpi label="Koneksi internet" value={live ? `${sc.up ?? 0}/${sc.total ?? 0}` : "–"} sub="aktif sekarang"
          color={sc.down ? NS.bad : NS.ok} icon={<Globe01 width={18} height={18} />} />
        <Kpi label="Perangkat online" value={live ? `${dc.up ?? 0}/${dc.total ?? 0}` : "–"} sub={dc.down ? `${dc.down} mati` : "semua online"}
          color={dc.down ? NS.warn : NS.ok} icon={<Server04 width={18} height={18} />} />
        <Kpi label="Pengguna terhubung" value={live ? (live.clients_total ?? 0) : "–"} sub="perangkat via DHCP"
          icon={<Users01 width={18} height={18} />} />
        <Kpi label="Masalah aktif" value={live ? issues : "–"} sub={issues ? "lihat daftar di atas" : "tidak ada"}
          color={issues ? NS.bad : NS.ok} icon={<AlertCircle width={18} height={18} />} />
        <Kpi label="Uptime 7 hari" value={pctText(week.avgUptime)} sub="rata-rata semua titik"
          color={uptimeColor(week.avgUptime)} icon={<CheckCircle width={18} height={18} />} />
        <Kpi label="Gangguan 7 hari" value={net ? week.incidents : "–"} sub={net ? `total ${fmtDur(week.downSeconds)}` : ""}
          color={week.incidents ? NS.warn : NS.ok} icon={<Clock width={18} height={18} />} />
      </div>

      {/* ── Koneksi internet (selebar penuh) ── */}
      <Panel title="Koneksi Internet" right={<LinkBtn to="/live-bandwidth">Lihat bandwidth</LinkBtn>}>
          {sites.length === 0 ? <Empty>{live ? "Belum ada data koneksi." : "Memuat…"}</Empty> : isMobile ? (
            sites.map((s, i) => (
              <MItem key={s.label} i={i} right={<StateText state={s.state} />}
                title={<>{shortLabel(s.label)}{s.is_standby && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: NS.label }}>CADANGAN</span>}</>}>
                <Bar pct={s.util_pct} color={loadColor(s.util_pct || 0)} />
                <div style={{ marginTop: 6 }}>
                  <MFacts cols={2} items={[
                    ["Latency", s.latency_ms == null ? "–" : `${s.latency_ms} ms`],
                    ["Download / Upload", s.in_mbps == null ? "–" : `${s.in_mbps} / ${s.out_mbps} Mbps`],
                  ]} />
                </div>
              </MItem>
            ))
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>{["Koneksi", "Status", "Latency", "Pemakaian", "Download / Upload"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sites.map((s, i) => (
                    <tr key={s.label} style={zebraRow(i, hover === `s${i}`)} onMouseEnter={() => setHover(`s${i}`)} onMouseLeave={() => setHover(null)}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {shortLabel(s.label)}
                        {s.is_standby && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: NS.label }}>CADANGAN</span>}
                      </td>
                      <td style={td}><StateText state={s.state} /></td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{s.latency_ms == null ? "–" : `${s.latency_ms} ms`}</td>
                      <td style={{ ...td, minWidth: 120 }}><Bar pct={s.util_pct} color={loadColor(s.util_pct || 0)} /></td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: NS.label }}>
                        {s.in_mbps == null ? "–" : `${s.in_mbps} / ${s.out_mbps} Mbps`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      {/* ── Lokasi & titik bermasalah (berdampingan, tinggi mirip) ── */}
      <div style={{ display: "grid", gap: 14, alignItems: "start", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <Panel title="Kondisi per Lokasi" right={<LinkBtn to="/mikrotik">Detail</LinkBtn>}>
          {locations.length === 0 ? <Empty>{routers || live ? "Belum ada data lokasi." : "Memuat…"}</Empty> : isMobile ? (
            locations.map((l, i) => (
              <MItem key={l.name} i={i} title={l.name}
                right={l.router ? <StateText state={l.router.online ? "UP" : "DOWN"} /> : null}>
                {l.router?.online && <Bar pct={Number(l.router.cpu_load)} color={loadColor(Number(l.router.cpu_load))} />}
                <div style={{ marginTop: 6 }}>
                  <MFacts cols={2} items={[
                    ["Perangkat", l.devTotal ? <>{l.devUp}/{l.devTotal} online{l.devDown > 0 && <b style={{ color: NS.bad }}> · {l.devDown} mati</b>}</> : "–"],
                    ["Pengguna", l.clients ?? "–"],
                  ]} />
                </div>
              </MItem>
            ))
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>{["Lokasi", "Router", "CPU", "Perangkat", "Pengguna"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {locations.map((l, i) => (
                    <tr key={l.name} style={zebraRow(i, hover === `l${i}`)} onMouseEnter={() => setHover(`l${i}`)} onMouseLeave={() => setHover(null)}>
                      <td style={{ ...td, fontWeight: 600 }}>{l.name}</td>
                      <td style={td}>{l.router ? <StateText state={l.router.online ? "UP" : "DOWN"} /> : <span style={{ color: NS.label }}>–</span>}</td>
                      <td style={{ ...td, minWidth: 110 }}>
                        {l.router?.online ? <Bar pct={Number(l.router.cpu_load)} color={loadColor(Number(l.router.cpu_load))} /> : "–"}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {l.devTotal ? <>{l.devUp}/{l.devTotal} online{l.devDown > 0 && <b style={{ color: NS.bad }}> · {l.devDown} mati</b>}</> : "–"}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{l.clients ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Paling Sering Bermasalah" right="7 hari terakhir">
          {!net ? <Empty>{failed.net ? "Data belum bisa dimuat." : "Memuat…"}</Empty>
            : week.worst.length === 0 ? <Empty>Semua titik stabil dalam 7 hari terakhir.</Empty> : isMobile ? (
            week.worst.map((e, i) => (
              <MItem key={e.key} i={i} title={e.name} sub={e.location}
                right={<b style={{ color: uptimeColor(e.uptime_pct) }}>{pctText(e.uptime_pct)}</b>}>
                <MFacts cols={2} items={[["Putus", `${e.incidents}×`], ["Total mati", fmtDur(e.downtime_seconds)]]} />
              </MItem>
            ))
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
                <thead>
                  <tr>{["Nama", "Lokasi", "Uptime", "Putus", "Total mati"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {week.worst.map((e, i) => (
                    <tr key={e.key} style={zebraRow(i, hover === `w${i}`)} onMouseEnter={() => setHover(`w${i}`)} onMouseLeave={() => setHover(null)}>
                      <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                      <td style={{ ...td, color: NS.label }}>{e.location}</td>
                      <td style={{ ...td, fontWeight: 700, color: uptimeColor(e.uptime_pct) }}>{pctText(e.uptime_pct)}</td>
                      <td style={td}>{e.incidents}×</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDur(e.downtime_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {week.coverage != null && week.coverage < 99 && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: NS.warn, background: NS.warnBg }}>
              Catatan belum lengkap: sistem pencatat hanya aktif {week.coverage}% dari 7 hari terakhir. Gangguan di luar waktu itu tidak tercatat, jadi kondisi sebenarnya bisa lebih buruk.
            </div>
          )}
        </Panel>
      </div>

      {/* ── Gangguan terbaru (selebar penuh) ── */}
      <Panel title="Gangguan Terbaru" right={<LinkBtn to="/catatan">Lihat semua</LinkBtn>}>
          {!net ? <Empty>{failed.net ? "Catatan gangguan belum bisa dimuat." : "Memuat…"}</Empty>
            : week.recent.length === 0 ? <Empty>Tidak ada gangguan dalam 7 hari terakhir.</Empty> : isMobile ? (
            week.recent.map((x, i) => {
              const a = parseTs(x.down_at);
              const b = parseTs(x.up_at);
              return (
                <MItem key={`${x.key}-${x.down_at}`} i={i} title={x.name} sub={`${String(x.key).split(":")[1]} · ${a.getDate()} ${BULAN[a.getMonth()]}`}
                  right={<b>{fmtDur(x.duration_seconds)}</b>}>
                  <MFacts cols={2} items={[
                    ["Mati", clock(a)],
                    ["Hidup", x.ongoing ? <span style={{ color: NS.bad }}>Masih mati</span> : clock(b)],
                  ]} />
                </MItem>
              );
            })
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>{["Tanggal", "Nama", "Lokasi", "Mati", "Hidup", "Lama"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {week.recent.map((x, i) => {
                    const a = parseTs(x.down_at);
                    const b = parseTs(x.up_at);
                    return (
                      <tr key={`${x.key}-${x.down_at}`} style={zebraRow(i, hover === `r${i}`)} onMouseEnter={() => setHover(`r${i}`)} onMouseLeave={() => setHover(null)}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{a.getDate()} {BULAN[a.getMonth()]}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{x.name}</td>
                        <td style={{ ...td, color: NS.label }}>{String(x.key).split(":")[1]}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{clock(a)}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", color: x.ongoing ? NS.bad : NS.text, fontWeight: x.ongoing ? 700 : 400 }}>
                          {x.ongoing ? "Masih mati" : clock(b)}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDur(x.duration_seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </div>
  );
}
