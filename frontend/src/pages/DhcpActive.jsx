import { useEffect, useMemo, useState } from "react";
import { Users01, Wifi, MarkerPin05 } from "@untitledui/icons";
import { buildApiUrl } from "../api";
import { NS, PageHeader, Panel, Alert, Field, MItem, MFacts, btn, fieldStyle, th, td, zebraRow } from "../components/ns";

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

const Dot = ({ color, size = 6 }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

/* Warna khas per router (sama pendekatan kayak siteColor di NOC) — tiap router
   dijatah warna berikutnya dari palet secara berurutan, biar gak ada dua router
   yang kebagian warna sama. */
const SITE_PALETTE = ["#2a5db0"]; // satu warna netral, seragam dengan halaman lain
const _siteColorAssigned = new Map();
function siteColor(name) {
  const key = String(name || "");
  let color = _siteColorAssigned.get(key);
  if (!color) {
    color = SITE_PALETTE[_siteColorAssigned.size % SITE_PALETTE.length];
    _siteColorAssigned.set(key, color);
  }
  return color;
}

const Counter = ({ label, value, color, Icon }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.borderMid}`, borderRadius: 3,
    padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, minWidth: 0,
  }}>
    {Icon && (
      <span style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34, borderRadius: 3, background: `${color}1c`, color,
      }}>
        <Icon width={17} height={17} />
      </span>
    )}
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: T.muted, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.15, fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" }}>{value}</div>
    </div>
  </div>
);

export default function DhcpActive() {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [routerId, setRouterId]       = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdate, setLastUpdate]   = useState("");
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth <= 640);

  const routerOptions = [
    { value: "all", label: "Semua Router" },
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

  const fetchDhcpActive = async (isBackground = false) => {
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      const url =
        routerId === "all"
          ? buildApiUrl("/api/mikrotik/dhcp-active")
          : buildApiUrl(`/api/mikrotik/dhcp-active?router_id=${routerId}`);

      const res = await fetch(url);
      let rawText = "";
      try { rawText = await res.text(); } catch {}
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        throw new Error(
          parsed?.detail || parsed?.message || parsed?.error ||
          rawText || "Gagal mengambil data user active"
        );
      }

      const rows = parsed?.data || [];
      setData(Array.isArray(rows) ? rows : []);
      setLastUpdate(new Date().toLocaleString("id-ID"));
    } catch (err) {
      if (!isBackground) setData([]);
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDhcpActive(false);
    const id = setInterval(() => fetchDhcpActive(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, routerId, rowsPerPage]);

  const filteredData = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return data;
    return data.filter((item) =>
      [item.router_name, item.address, item["mac-address"], item["host-name"], item.server, item.status]
        .some((v) => String(v || "").toLowerCase().includes(keyword))
    );
  }, [data, searchTerm]);

  const totalPages =
    rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(filteredData.length / Number(rowsPerPage)));

  const displayedData = useMemo(() => {
    if (rowsPerPage === "all") return filteredData;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return filteredData.slice(start, start + Number(rowsPerPage));
  }, [filteredData, rowsPerPage, currentPage]);

  const startRow = filteredData.length === 0 ? 0 : rowsPerPage === "all" ? 1 : (currentPage - 1) * Number(rowsPerPage) + 1;
  const endRow   = filteredData.length === 0 ? 0 : rowsPerPage === "all" ? filteredData.length : Math.min(currentPage * Number(rowsPerPage), filteredData.length);

  const rowNum = (index) =>
    rowsPerPage === "all" ? index + 1 : (currentPage - 1) * Number(rowsPerPage) + index + 1;

  // Jumlah user aktif per router (buat counter di header, mirip NOC)
  const routerCounts = useMemo(() => {
    const g = {};
    for (const item of data) {
      const k = item.router_name || "Lainnya";
      g[k] = (g[k] || 0) + 1;
    }
    return Object.entries(g)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const [hoverRow, setHoverRow] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: NS.font, color: NS.text }}>
      <PageHeader
        title="Active Users"
        subtitle={`${data.length} devices connected (MikroTik DHCP) · ${refreshing ? "updating…" : `updated ${lastUpdate || "—"}`}`}
      />

      <Panel title="Filter" pad={12}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr" }}>
          <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <Field label="Cari">
              <input
                type="text"
                placeholder="IP, MAC, hostname, router…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={fieldStyle}
              />
            </Field>
          </div>
          <Field label="Router">
            <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={fieldStyle}>
              {routerOptions.map((r) => {
                const n = r.value === "all" ? null : routerCounts.find((c) => c.name === r.label)?.count;
                return <option key={r.value} value={r.value}>{r.label}{n != null ? ` (${n})` : ""}</option>;
              })}
            </select>
          </Field>
          <Field label="Baris per halaman">
            <select value={rowsPerPage} onChange={(e) => setRowsPerPage(e.target.value)} style={fieldStyle}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">Semua</option>
            </select>
          </Field>
        </div>
      </Panel>

      {error && <Alert tone="bad" title="Gagal memuat data">{error}</Alert>}

      <Panel title="Daftar User Aktif" right={!loading && !error ? `Total: ${filteredData.length}` : null}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: NS.label, fontSize: 13 }}>Memuat data DHCP…</div>
        ) : error ? null : isMobile ? (
          displayedData.length > 0 ? displayedData.map((item, index) => (
            <MItem key={item[".id"] || `${item.address}-${index}`} i={index}
              title={<span style={{ color: NS.link }}>{item.address || "—"}</span>}
              sub={item["host-name"] || "Tanpa hostname"}
              right={<span style={{ color: NS.ok, fontWeight: 700 }}>{item.status || "Active"}</span>}>
              <MFacts cols={2} items={[
                ["Router", item.router_name || "—"],
                ["MAC Address", item["mac-address"] || "—"],
              ]} />
            </MItem>
          )) : <EmptyState />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  {["#", "Router", "IP Address", "MAC Address", "Hostname", "Server", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {displayedData.length > 0 ? displayedData.map((item, index) => {
                  const rk = item[".id"] || `${item.address}-${index}`;
                  return (
                    <tr key={rk} onMouseEnter={() => setHoverRow(rk)} onMouseLeave={() => setHoverRow(null)}
                      style={zebraRow(index, hoverRow === rk)}>
                      <td style={{ ...td, color: NS.label, width: 48 }}>{rowNum(index)}</td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <Dot color={siteColor(item.router_name)} size={7} />
                          {item.router_name || "—"}
                        </span>
                      </td>
                      <td style={{ ...td, color: NS.link, fontWeight: 600 }}>{item.address || "—"}</td>
                      <td style={{ ...td, color: NS.label }}>{item["mac-address"] || "—"}</td>
                      <td style={td}>{item["host-name"] || "—"}</td>
                      <td style={{ ...td, color: NS.label }}>{item.server || "—"}</td>
                      <td style={{ ...td, color: NS.ok, fontWeight: 700 }}>{item.status || "Active"}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filteredData.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: NS.zebra, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: NS.label }}>
              Menampilkan <b style={{ color: NS.text }}>{startRow}–{endRow}</b> dari <b style={{ color: NS.text }}>{filteredData.length}</b> data
            </span>
            {rowsPerPage !== "all" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                  style={btn(false, currentPage === 1)}>‹ Sebelumnya</button>
                <span style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  style={btn(false, currentPage === totalPages)}>Berikutnya ›</button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "32px 24px" }}>
      <div style={{ color: NS.text, fontSize: 14, fontWeight: 600 }}>Tidak ada data</div>
      <div style={{ color: NS.label, fontSize: 13, marginTop: 4 }}>Coba ubah pencarian atau router yang dipilih.</div>
    </div>
  );
}
