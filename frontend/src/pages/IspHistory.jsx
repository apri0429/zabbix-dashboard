import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "../api";

const T = {
  navy:      "#1a2a57",
  teal:      "#2a9d8f",
  coral:     "#e76f51",
  gold:      "#e9c46a",
  text:      "#0f2035",
  textSoft:  "#425575",
  muted:     "#5a6b88",
  border:    "rgba(26,42,87,0.10)",
  borderMid: "rgba(26,42,87,0.18)",
  surface:   "#ffffff",
  surfaceAlt:"rgba(248,249,250,0.95)",
};

const RANGES = [
  { days: 1,  label: "24 jam" },
  { days: 7,  label: "7 hari" },
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
];

const STATE_STYLE = {
  UP:      { bg: "#e6f6f3", fg: "#18786e", label: "ONLINE" },
  DOWN:    { bg: "#fdecea", fg: "#b42318", label: "DOWN" },
  UNKNOWN: { bg: "#fff6e0", fg: "#8a6100", label: "TIDAK DIKETAHUI" },
};

function useBreakpoint() {
  const get = () => (typeof window === "undefined" ? 1200 : window.innerWidth);
  const [w, setW] = useState(get);
  useEffect(() => {
    const h = () => setW(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: w < 720 };
}

function fmtDur(sec) {
  if (sec == null) return "–";
  if (sec < 60) return `${sec} dtk`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} j ${m % 60} mnt`;
  return `${Math.floor(h / 24)} hr ${h % 24} j`;
}

const fmtTime = (s) => (s ? s.replace(" ", " · ").slice(0, 21) : "–");

function uptimeColor(p) {
  if (p == null) return T.muted;
  if (p >= 99.9) return "#18786e";
  if (p >= 99) return "#8a6100";
  return "#b42318";
}

const Badge = ({ state }) => {
  const s = STATE_STYLE[state] || STATE_STYLE.UNKNOWN;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", background: s.bg, color: s.fg,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.fg }} />
      {s.label}
    </span>
  );
};

const Stat = ({ label, value, color }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: "0.03em" }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, color: color || T.text, marginTop: 2 }}>{value}</div>
  </div>
);

const MODE_CFG = {
  isp: {
    path: "/api/noc/isp", title: "Catatan ISP", noun: "ISP",
    subtitle: "Riwayat down & pulih tiap ISP",
    emptyList: "Belum ada ISP terdeteksi. ISP dikenali dari entri Netwatch ber-host IP publik (mis. 8.8.8.8).",
    emptyIncidents: "Tidak ada gangguan ISP pada periode ini.",
  },
  device: {
    path: "/api/noc/devices", title: "Catatan Perangkat", noun: "Perangkat",
    subtitle: "Riwayat down & pulih AP, switch, dan perangkat lain dari Netwatch",
    emptyList: "Belum ada perangkat tercatat. Perangkat dibaca dari entri Netwatch di router.",
    emptyIncidents: "Tidak ada gangguan perangkat pada periode ini.",
  },
};

export default function IspHistory({ mode = "isp" }) {
  const CFG = MODE_CFG[mode] || MODE_CFG.isp;
  const isDevice = mode === "device";
  const { isMobile } = useBreakpoint();
  const [loc, setLoc] = useState("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(7);
  const [ispKey, setIspKey] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: res } = await axios.get(`${API_BASE}${CFG.path}`, {
        params: { days },
        timeout: 30000,
      });
      // Backend lama (belum di-restart) menjawab /api/noc/isp dengan index.html, bukan JSON.
      if (!res || typeof res !== "object" || !Array.isArray(res.isps)) {
        throw new Error("Respons tidak valid. Pastikan backend sudah di-restart dengan versi terbaru.");
      }
      setData(res);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || `Gagal memuat data ${CFG.noun.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [days, CFG.path]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const locations = useMemo(
    () => [...new Set((data?.isps || []).map((i) => i.location))].sort(),
    [data],
  );

  // Mode perangkat: saring per lokasi / pencarian, yang bermasalah ditaruh paling atas.
  const shownDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = { DOWN: 0, UNKNOWN: 1, UP: 2 };
    return (data?.isps || [])
      .filter((i) => (loc === "all" || i.location === loc) &&
        (!q || `${i.name} ${i.host}`.toLowerCase().includes(q)))
      .sort((a, b) =>
        (rank[a.state] ?? 3) - (rank[b.state] ?? 3) ||
        (a.uptime_pct ?? 100) - (b.uptime_pct ?? 100) || b.incidents - a.incidents);
  }, [data, loc, search]);

  const incidents = useMemo(() => {
    const all = data?.incidents || [];
    const keys = new Set(shownDevices.map((i) => i.key));
    return all.filter((x) => (ispKey === "all" || x.key === ispKey) && (!isDevice || keys.has(x.key)));
  }, [data, ispKey, shownDevices, isDevice]);

  const summary = useMemo(() => {
    const list = data?.isps || [];
    return {
      total: list.length,
      up: list.filter((i) => i.state === "UP").length,
      down: list.filter((i) => i.state === "DOWN").length,
      incidents: data?.incident_total ?? (data?.incidents || []).length,
    };
  }, [data]);

  const cov = data?.coverage;
  const lowCoverage = cov && cov.coverage_pct != null && cov.coverage_pct < 99;

  const card = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
    padding: isMobile ? 14 : 18,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: T.text }}>
      {/* Header + rentang waktu */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 10,
      }}>
        <div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: T.navy }}>{CFG.title}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>
            {CFG.subtitle}{data?.generated_at ? ` · diperbarui ${data.generated_at.slice(11)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                padding: "6px 14px", borderRadius: 99, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                border: `1px solid ${days === r.days ? T.navy : T.borderMid}`,
                background: days === r.days ? T.navy : T.surface,
                color: days === r.days ? "#fff" : T.textSoft,
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: "#f1b5ae", background: "#fdecea", color: "#b42318", fontSize: 13 }}>
          {error}
        </div>
      )}

      {lowCoverage && (
        <div style={{
          ...card, background: "#fff6e0", borderColor: "#f0d68a", color: "#6b4b00", fontSize: 13, lineHeight: 1.5,
        }}>
          <b>Pemantauan hanya aktif {cov.coverage_pct}% dari periode ini.</b>{" "}
          Selama backend mati ({fmtDur(cov.blackout_seconds)}), gangguan tidak terekam, jadi angka uptime di
          bawah adalah batas atas, bukan angka pasti.
        </div>
      )}

      {loading && !data && <div style={{ ...card, color: T.muted, fontSize: 13 }}>Memuat…</div>}

      {/* Kartu per ISP */}
      {data && !isDevice && (
        <div style={{
          display: "grid", gap: 12,
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
        }}>
          {data.isps.length === 0 && (
            <div style={{ ...card, color: T.muted, fontSize: 13 }}>
              {CFG.emptyList}
            </div>
          )}
          {data.isps.map((i) => {
            const active = ispKey === i.key;
            return (
              <div
                key={i.key}
                onClick={() => setIspKey(active ? "all" : i.key)}
                style={{
                  ...card, cursor: "pointer",
                  borderColor: active ? T.navy : T.border,
                  boxShadow: active ? `0 0 0 2px ${T.navy}22` : "none",
                }}
                title="Klik untuk menyaring daftar insiden"
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: T.text }}>{i.name}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                      {i.location} · {i.host}
                    </div>
                  </div>
                  <Badge state={i.state} />
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 14,
                }}>
                  <Stat label="UPTIME" value={i.uptime_pct == null ? "–" : `${i.uptime_pct}%`} color={uptimeColor(i.uptime_pct)} />
                  <Stat label="INSIDEN" value={i.incidents} color={i.incidents ? "#b42318" : undefined} />
                  <Stat label="TOTAL DOWN" value={i.downtime_seconds ? fmtDur(i.downtime_seconds) : "0"} />
                  <Stat label="TERPANJANG" value={i.longest_seconds ? fmtDur(i.longest_seconds) : "–"} />
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12 }}>
                  {STATE_STYLE[i.state]?.label.toLowerCase() || i.state.toLowerCase()} sejak {fmtTime(i.state_since)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ringkasan + tabel perangkat */}
      {data && isDevice && (
        <>
          <div style={{
            display: "grid", gap: 12,
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          }}>
            {[
              ["PERANGKAT", summary.total, T.text],
              ["ONLINE", summary.up, "#18786e"],
              ["DOWN", summary.down, summary.down ? "#b42318" : T.text],
              ["INSIDEN", summary.incidents, summary.incidents ? "#8a6100" : T.text],
            ].map(([label, value, color]) => (
              <div key={label} style={card}><Stat label={label} value={value} color={color} /></div>
            ))}
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
              padding: isMobile ? 14 : "14px 18px", borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginRight: "auto" }}>
                Perangkat <span style={{ color: T.muted, fontWeight: 500 }}>({shownDevices.length})</span>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / IP…"
                style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.borderMid}`,
                  fontSize: 12.5, color: T.text, background: T.surface, minWidth: 140,
                }}
              />
              <select
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.borderMid}`,
                  fontSize: 12.5, color: T.text, background: T.surface,
                }}
              >
                <option value="all">Semua lokasi</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {shownDevices.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>
                {data.isps.length === 0 ? CFG.emptyList : "Tidak ada perangkat yang cocok dengan filter."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.surfaceAlt, textAlign: "left", color: T.muted, fontSize: 11.5 }}>
                      {["Perangkat", "Lokasi", "Status", "Uptime", "Insiden", "Total down", "Terpanjang"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownDevices.map((i) => {
                      const active = ispKey === i.key;
                      return (
                        <tr
                          key={i.key}
                          onClick={() => setIspKey(active ? "all" : i.key)}
                          title="Klik untuk menyaring daftar insiden"
                          style={{
                            borderTop: `1px solid ${T.border}`, cursor: "pointer",
                            background: active ? "rgba(26,42,87,0.06)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                            {i.name}
                            <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 400 }}>{i.host}</div>
                          </td>
                          <td style={{ padding: "10px 14px", color: T.textSoft, whiteSpace: "nowrap" }}>{i.location}</td>
                          <td style={{ padding: "10px 14px" }}><Badge state={i.state} /></td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: uptimeColor(i.uptime_pct), whiteSpace: "nowrap" }}>
                            {i.uptime_pct == null ? "–" : `${i.uptime_pct}%`}
                          </td>
                          <td style={{ padding: "10px 14px", color: i.incidents ? "#b42318" : T.muted, fontWeight: 600 }}>{i.incidents}</td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{i.downtime_seconds ? fmtDur(i.downtime_seconds) : "–"}</td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>{i.longest_seconds ? fmtDur(i.longest_seconds) : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Daftar insiden */}
      {data && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{
            display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
            gap: 8, padding: isMobile ? 14 : "14px 18px", borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
              Daftar insiden <span style={{ color: T.muted, fontWeight: 500 }}>({incidents.length})</span>
              {data.incident_total > data.incidents.length && (
                <div style={{ fontSize: 11.5, color: "#8a6100", fontWeight: 500, marginTop: 2 }}>
                  Menampilkan {data.incidents.length} terbaru dari {data.incident_total} insiden. Pilih rentang lebih pendek untuk yang lebih lama.
                </div>
              )}
            </div>
            {isDevice ? (
              ispKey !== "all" && (
                <button
                  onClick={() => setIspKey("all")}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.borderMid}`,
                    fontSize: 12.5, color: T.textSoft, background: T.surface, cursor: "pointer",
                  }}
                >Tampilkan semua perangkat</button>
              )
            ) : (
              <select
                value={ispKey}
                onChange={(e) => setIspKey(e.target.value)}
                style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.borderMid}`,
                  fontSize: 12.5, color: T.text, background: T.surface,
                }}
              >
                <option value="all">Semua ISP</option>
                {data.isps.map((i) => (
                  <option key={i.key} value={i.key}>{i.location} — {i.name}</option>
                ))}
              </select>
            )}
          </div>

          {incidents.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>
              {CFG.emptyIncidents}
            </div>
          ) : isMobile ? (
            <div>
              {incidents.map((x, idx) => (
                <div key={idx} style={{ padding: 14, borderTop: idx ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 13.5 }}>{x.name}</b>
                    <b style={{ fontSize: 13.5, color: "#b42318" }}>{fmtDur(x.duration_seconds)}</b>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{x.key.split(":")[1]}</div>
                  <div style={{ fontSize: 12.5, color: T.textSoft, marginTop: 6 }}>
                    {fmtTime(x.down_at)} → {x.ongoing ? <b style={{ color: "#b42318" }}>berlangsung</b> : fmtTime(x.up_at)}
                  </div>
                  {!x.duration_certain && (
                    <div style={{ fontSize: 11.5, color: "#8a6100", marginTop: 4 }}>
                      ⚠ {fmtDur(x.unmonitored_seconds)} tidak terpantau
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.surfaceAlt, textAlign: "left", color: T.muted, fontSize: 11.5 }}>
                    {[CFG.noun, "Lokasi", "Mulai down", "Pulih", "Durasi", "Keterangan"].map((h) => (
                      <th key={h} style={{ padding: "10px 18px", fontWeight: 700, letterSpacing: "0.03em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((x, idx) => (
                    <tr key={idx} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "11px 18px", fontWeight: 600 }}>{x.name}</td>
                      <td style={{ padding: "11px 18px", color: T.textSoft }}>{x.key.split(":")[1]}</td>
                      <td style={{ padding: "11px 18px", whiteSpace: "nowrap" }}>{fmtTime(x.down_at)}</td>
                      <td style={{ padding: "11px 18px", whiteSpace: "nowrap" }}>
                        {x.ongoing ? <b style={{ color: "#b42318" }}>Masih berlangsung</b> : fmtTime(x.up_at)}
                      </td>
                      <td style={{ padding: "11px 18px", fontWeight: 700, color: "#b42318", whiteSpace: "nowrap" }}>
                        {fmtDur(x.duration_seconds)}
                      </td>
                      <td style={{ padding: "11px 18px", fontSize: 12, color: "#8a6100" }}>
                        {x.duration_certain ? "" : `⚠ ${fmtDur(x.unmonitored_seconds)} tidak terpantau`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
