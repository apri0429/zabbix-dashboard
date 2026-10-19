import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../api";
import { MarkerPin01 } from "@untitledui/icons";
import { NS, PageHeader, Panel, Alert, MItem, fieldStyle, th, td } from "../components/ns";

const T = {
  navy:      "#24385b",
  navyMid:   "#2a5db0",
  teal:      "#2a9d8f",
  text:      "#0f2035",
  textSoft:  "#425575",
  muted:     "#5a6b88",
  border:    "rgba(26,42,87,0.10)",
  borderMid: "rgba(26,42,87,0.18)",
  surface:   "#ffffff",
  surfaceAlt:"rgba(248,249,250,0.95)",
};

// Download vs Upload sengaja dibikin dua warna yang beda jauh (teal vs oranye),
// bukan dua nuansa navy yang mirip — biar kebedain sekilas tanpa baca label.
const DL_COLOR = "#2a5db0"; // biru — Download (sama dengan Dashboard)
const UL_COLOR = "#e08a2e"; // oranye — Upload (sama dengan Dashboard)

// Grafik tren kecil buat tiap baris (mirip sparkline latency di NOC) — biar
// kelihatan naik-turunnya trafik, bukan cuma angka & bar % dari max limit.
const TREND_MAX_POINTS = 30; // ~2.5 menit riwayat (polling tiap 5 detik)

const Sparkline = ({ points = [], color, w = 100, h = 26 }) => {
  const vals = points.map((p) => (p == null ? null : Number(p))).filter((v) => v != null && !Number.isNaN(v));
  if (vals.length < 2) return <span style={{ fontSize: 10.5, color: T.muted }}>Collecting data…</span>;
  const max = Math.max(...vals, 0.001);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const stepX = w / (points.length - 1);
  let d = "";
  points.forEach((p, i) => {
    if (p == null || Number.isNaN(Number(p))) return;
    const x = i * stepX;
    const y = h - ((Number(p) - min) / span) * (h - 4) - 2;
    d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
};

export default function LiveBandwidth() {
  const [data, setData]               = useState([]);
  const [trendMap, setTrendMap]       = useState({}); // key -> [rate Mbps, ...] riwayat singkat
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [routerId, setRouterId]       = useState("all");
  const [q, setQ]                     = useState("");
  const [sortBy, setSortBy]           = useState("default");
  const [peakMap, setPeakMap]         = useState({}); // key -> puncak Mbps sejak halaman dibuka
  const [lastUpdate, setLastUpdate]   = useState("");
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth <= 640);
  // Router yang gagal dibaca (mis. VPN site putus): [{router_id, router_name, error}].
  // Router lain tetap tampil & terus diperbarui.
  const [offline, setOffline]         = useState([]);
  const busyRef = useRef(false);   // jangan tumpuk request kalau yang lama belum selesai
  const reqSeq  = useRef(0);       // abaikan balasan telat setelah ganti router

  const routerOptions = [
    { value: "all", label: "All Routers" },
    { value: "1",   label: "HO Duta Garden" },
    { value: "2",   label: "Gudang Jatake" },
    { value: "3",   label: "Gudang Ks Tubun" },
    { value: "4",   label: "Gudang Rawa Bokor" },
  ];

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fetchEtherTraffic = async (isBackground = false) => {
    if (isBackground && busyRef.current) return;
    busyRef.current = true;
    const seq = ++reqSeq.current;
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      const url =
        routerId === "all"
          ? buildApiUrl("/api/mikrotik/ether-traffic")
          : buildApiUrl(`/api/mikrotik/ether-traffic?router_id=${routerId}`);

      const res = await fetch(url);
      let rawText = "";
      try { rawText = await res.text(); } catch {}
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        throw new Error(parsed?.detail || parsed?.message || parsed?.error || rawText || "Gagal mengambil data");
      }

      if (seq !== reqSeq.current) return;
      const rows = Array.isArray(parsed?.data) ? parsed.data : [];
      setData(rows);
      setOffline(Array.isArray(parsed?.errors) ? parsed.errors : []);
      setLastUpdate(new Date().toLocaleTimeString("en-GB"));

      setPeakMap((prev) => {
        const next = { ...prev };
        for (const item of rows) {
          const key = `${item.router_id}|${item.name}`;
          const mbps = item.rate == null ? 0 : Number(item.rate) / 1_000_000;
          if (!(mbps <= (next[key] ?? 0))) next[key] = mbps;
        }
        return next;
      });

      // Simpan rate terbaru tiap interface ke riwayat singkat (buat sparkline).
      setTrendMap((prev) => {
        const next = { ...prev };
        for (const item of rows) {
          const key = `${item.router_id}|${item.name}`;
          const rateMbps = item.rate == null ? null : Number(item.rate) / 1_000_000;
          const hist = [...(next[key] || []), rateMbps];
          next[key] = hist.slice(-TREND_MAX_POINTS);
        }
        return next;
      });
    } catch (err) {
      if (seq !== reqSeq.current) return;
      // Polling di latar: data terakhir tetap ditampilkan, cukup tampilkan pesan error.
      if (!isBackground) { setData([]); setOffline([]); }
      setError(err.message || "Terjadi kesalahan");
    } finally {
      if (seq === reqSeq.current) {
        busyRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchEtherTraffic(false);
    const id = setInterval(() => fetchEtherTraffic(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  const toMbps = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : `${(n / 1_000_000).toFixed(2)} Mbps`;
  };

  const toBytes = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
    if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(2)} MB`;
    if (n >= 1_024)         return `${(n / 1_024).toFixed(2)} KB`;
    return `${n} B`;
  };

  const DL_SUFFIXES = ["-download", "-dl", "-down"];
  const UL_SUFFIXES = ["-upload", "-ul", "-up"];

  const getGroupKey = (name = "") => {
    const lower = name.toLowerCase();
    for (const suffix of [...DL_SUFFIXES, ...UL_SUFFIXES]) {
      if (lower.endsWith(suffix)) return name.slice(0, name.length - suffix.length);
    }
    return null;
  };

  const isDownloadQueue = (name = "") => DL_SUFFIXES.some((s) => name.toLowerCase().endsWith(s));

  const groupedRows = useMemo(() => {
    const groups = {};
    const groupRouter = {};
    const standalone = [];
    const groupOrder = [];

    data.forEach((item) => {
      const key = getGroupKey(item.name);
      if (key) {
        if (!groups[key]) {
          groups[key] = { key, download: null, upload: null };
          groupOrder.push(key);
          groupRouter[key] = { name: item.router_name, id: item.router_id };
        }
        if (isDownloadQueue(item.name)) groups[key].download = item;
        else groups[key].upload = item;
      } else {
        standalone.push(item);
      }
    });

    // Data dari backend sudah berurutan per router (router 1 semua port-nya
    // dulu, baru router 2, dst) — jadi cukup nyisipin pemisah tiap kali router
    // ganti, biar keliatan jelas ini "site mana" tanpa perlu ngewarnain kartu.
    const result = [];
    let lastRouterId;
    const maybeRouterSep = (router) => {
      if (router?.id === lastRouterId) return;
      lastRouterId = router?.id;
      result.push({ type: "router-sep", id: router?.id, name: router?.name || "Router lain" });
    };

    groupOrder.forEach((key) => {
      const g = groups[key];
      maybeRouterSep(groupRouter[key]);
      result.push({ type: "sep", key });
      if (g.download) result.push({ type: "row", item: g.download, label: "Download", accent: "dl" });
      if (g.upload)   result.push({ type: "row", item: g.upload,   label: "Upload",   accent: "ul" });
    });
    standalone.forEach((item) => {
      maybeRouterSep({ name: item.router_name, id: item.router_id });
      result.push({ type: "row", item, label: null, accent: null });
    });

    return result;
  }, [data]);

  // Susun ulang baris jadi per router → per port, supaya tiap router tampil
  // sebagai satu panel dan Download/Upload satu port berdampingan.
  const sections = useMemo(() => {
    const out = [];
    let cur = null;
    let port = null;
    for (const row of groupedRows) {
      if (row.type === "router-sep") {
        cur = { id: row.id, name: row.name, ports: [] };
        out.push(cur);
        port = null;
      } else if (row.type === "sep") {
        port = { name: row.key, rows: [] };
        cur.ports.push(port);
      } else {
        if (!port || row.label == null) {
          port = { name: row.item.name, rows: [] };
          cur.ports.push(port);
        }
        port.rows.push(row);
        if (row.label == null) port = null;
      }
    }
    return out;
  }, [groupedRows]);

  const fmtRate = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "–" : (Number(v) / 1_000_000).toFixed(2));

  // Ambang sorotan: ≥100 Mbps oranye, ≥500 Mbps merah.
  const HIGH_MBPS = 100;
  const VERY_HIGH_MBPS = 500;

  // Pembanding bar: port tersibuk di tampilan (minimal 10 Mbps supaya port sepi tidak terlihat penuh).
  const maxMbps = useMemo(
    () => Math.max(10, ...data.map((d) => (d.rate == null ? 0 : Number(d.rate) / 1_000_000))),
    [data],
  );

  const visibleSections = useMemo(() => {
    const term = q.trim().toLowerCase();
    const sum = (pt) => pt.rows.reduce((t, r) => t + (Number(r.item.rate) || 0), 0);
    const online = sections
      .map((sec) => {
        let ports = sec.ports.filter((pt) => !term || pt.name.toLowerCase().includes(term));
        if (sortBy === "fastest") ports = [...ports].sort((a, b) => sum(b) - sum(a));
        return { ...sec, ports };
      })
      .filter((sec) => sec.ports.length > 0);
    // Router offline disisipkan sesuai urutan router (saat tidak sedang mencari port).
    const down = term ? [] : offline.map((o) => ({ id: o.router_id, name: o.router_name, error: o.error, offline: true }));
    return [...online, ...down].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  }, [sections, offline, q, sortBy]);

  const portCell = (row, trendColor) => {
    if (!row) return <span style={{ color: NS.muted }}>–</span>;
    const key = `${row.item.router_id}|${row.item.name}`;
    const trend = trendMap[key] || [];
    const mbps = row.item.rate == null ? null : Number(row.item.rate) / 1_000_000;
    const peak = peakMap[key];
    const level = mbps == null ? NS.text : mbps >= VERY_HIGH_MBPS ? NS.bad : mbps >= HIGH_MBPS ? NS.warn : NS.text;
    const barColor = mbps != null && mbps >= HIGH_MBPS ? level : trendColor;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 104, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", color: level }}>
            {fmtRate(row.item.rate)} <span style={{ fontWeight: 500, color: NS.label, fontSize: 11 }}>Mbps</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: NS.colHead, overflow: "hidden", marginTop: 4 }} title={`${Math.round(((mbps || 0) / maxMbps) * 100)}% of busiest port`}>
            <div style={{ height: "100%", width: `${Math.min(100, ((mbps || 0) / maxMbps) * 100)}%`, background: barColor }} />
          </div>
        </div>
        <div>
          <Sparkline points={trend} color={trendColor} w={isMobile ? 60 : 90} />
          <div style={{ fontSize: 10.5, color: NS.label, marginTop: 2, whiteSpace: "nowrap" }}>
            Peak {(peak ?? 0).toFixed((peak ?? 0) < 1 ? 2 : 1)} Mbps
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: NS.font, color: NS.text }}>
      <PageHeader
        title="Live Bandwidth"
        subtitle={`Current speed of each MikroTik port · updated ${lastUpdate || "—"}${offline.length ? ` · ${offline.length} router offline` : ""}`}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
            <input
              type="search"
              placeholder="Search port…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ ...fieldStyle, width: isMobile ? "100%" : 180 }}
            />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...fieldStyle, width: isMobile ? "100%" : 160 }} aria-label="Sort ports">
              <option value="default">Default order</option>
              <option value="fastest">Fastest first</option>
            </select>
            <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={{ ...fieldStyle, width: isMobile ? "100%" : 200 }}>
              {routerOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        }
      />

      {error && (
        <Alert tone="bad" title="Failed to load data">
          {error}{data.length > 0 && " — showing the last data received, retrying every 5 seconds."}
        </Alert>
      )}

      {loading ? (
        <Panel pad={24}><div style={{ textAlign: "center", color: NS.label, fontSize: 13 }}>Loading bandwidth data…</div></Panel>
      ) : !error && sections.length === 0 && offline.length === 0 ? (
        <Alert tone="info" title="No live bandwidth data">Try selecting a different router.</Alert>
      ) : visibleSections.length === 0 ? (
        <Alert tone="info" title="No matching ports">No port matches “{q}”.</Alert>
      ) : (
        visibleSections.map((sec) => sec.offline ? (
          <Panel
            key={`off-${sec.id}`}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><MarkerPin01 width={16} height={16} />{sec.name}</span>}
            right={
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: NS.bad,
                background: NS.badBg, borderRadius: 999, padding: "2px 10px",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: NS.bad }} />
                Offline
              </span>
            }
          >
            <div style={{ padding: "14px 16px", fontSize: 13, color: NS.text, lineHeight: 1.5 }}>
              Router can't be reached right now — other sites keep updating. Retrying every 5 seconds.
              <div style={{ marginTop: 4, fontSize: 11.5, color: NS.label, overflowWrap: "anywhere" }}>{sec.error}</div>
            </div>
          </Panel>
        ) : (
          <Panel
            key={`on-${sec.id ?? sec.name}`}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><MarkerPin01 width={16} height={16} />{sec.name}</span>}
            right={`${sec.ports.length} ports`}
          >
            {isMobile ? sec.ports.map((pt, i) => {
              const dl = pt.rows.find((r) => r.accent === "dl");
              const ul = pt.rows.find((r) => r.accent === "ul");
              const single = pt.rows.find((r) => r.label == null);
              const lbl = (t, c) => <div style={{ fontSize: 11, fontWeight: 700, color: c, textTransform: "uppercase", marginBottom: 4 }}>{t}</div>;
              return (
                <MItem key={pt.name} i={i} title={pt.name}
                  right={<span style={{ color: NS.label }}>{single ? toBytes(single.item.bytes) : `${dl ? toBytes(dl.item.bytes) : "–"} / ${ul ? toBytes(ul.item.bytes) : "–"}`}</span>}>
                  {single ? portCell(single, NS.navy) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>{lbl("Download", DL_COLOR)}{portCell(dl, DL_COLOR)}</div>
                      <div>{lbl("Upload", UL_COLOR)}{portCell(ul, UL_COLOR)}</div>
                    </div>
                  )}
                </MItem>
              );
            }) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "24%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>Port</th>
                    <th style={{ ...th, color: DL_COLOR }}>Download</th>
                    <th style={{ ...th, color: UL_COLOR }}>Upload</th>
                    <th style={th}>Total data (↓ / ↑)</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.ports.map((pt, i) => {
                    const dl = pt.rows.find((r) => r.accent === "dl");
                    const ul = pt.rows.find((r) => r.accent === "ul");
                    const single = pt.rows.find((r) => r.label == null);
                    const bg = i % 2 ? NS.zebra : NS.surface;
                    return (
                      <tr key={pt.name} style={{ background: bg }}>
                        <td style={{ ...td, fontWeight: 700, verticalAlign: "middle", overflowWrap: "anywhere" }}>{pt.name}</td>
                        {single ? (
                          <td style={{ ...td, verticalAlign: "middle" }} colSpan={2}>{portCell(single, NS.navy)}</td>
                        ) : (
                          <>
                            <td style={{ ...td, verticalAlign: "middle" }}>{portCell(dl, DL_COLOR)}</td>
                            <td style={{ ...td, verticalAlign: "middle" }}>{portCell(ul, UL_COLOR)}</td>
                          </>
                        )}
                        <td style={{ ...td, color: NS.label, whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          {single ? toBytes(single.item.bytes) : `${dl ? toBytes(dl.item.bytes) : "–"} / ${ul ? toBytes(ul.item.bytes) : "–"}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
