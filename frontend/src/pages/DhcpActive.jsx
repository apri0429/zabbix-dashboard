import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../api";
import {
  NS, PageHeader, Alert, AlertButton, MItem, MFacts, fieldStyle, zebraRow,
  NS_SHADOW, listPanel, listTd as baseTd, FilterBar, FilterField, SortTh, ListFooter,
} from "../components/ns";

const Dot = ({ color, size = 6 }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

/* Sisa lease dari RouterOS ("1d2h3m4s", "9m15s", atau "01:02:03") -> detik. */
function leaseSeconds(v) {
  if (!v) return null;
  const t = String(v).trim();
  const hms = /^(?:(\d+)d)?(\d+):(\d+):(\d+)$/.exec(t);
  if (hms) return (+hms[1] || 0) * 86400 + +hms[2] * 3600 + +hms[3] * 60 + +hms[4];
  const re = /(\d+)([wdhms])/g;
  const unit = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0, m, found = false;
  while ((m = re.exec(t))) { total += +m[1] * unit[m[2]]; found = true; }
  return found ? total : null;
}

function leaseText(v) {
  const sec = leaseSeconds(v);
  if (sec == null) return "–";
  if (sec <= 0) return "Expired";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return h ? `${d} hari ${h} jam` : `${d} hari`;
  if (h) return m ? `${h} jam ${m} mnt` : `${h} jam`;
  if (m) return `${m} mnt`;
  return `${sec} dtk`;
}

/* Kolom daftar: label header + cara ambil nilai untuk diurutkan. */
const COLUMNS = [
  { key: "router_name", label: "Router" },
  { key: "address",     label: "IP Address", get: (r) => (r.address || "").split(".").map((n) => n.padStart(3, "0")).join(".") },
  { key: "mac-address", label: "MAC Address" },
  { key: "host-name",   label: "Hostname" },
  { key: "expires-after", label: "Expired", get: (r) => leaseSeconds(r["expires-after"]) ?? Infinity },
  { key: "status",      label: "Status", sortable: false },
];

const listTd = { ...baseTd, whiteSpace: "nowrap" };

export default function DhcpActive() {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState("");
  const [routerId, setRouterId]       = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [rowsPerPage, setRowsPerPage] = useState("25");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdate, setLastUpdate]   = useState("");
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth <= 640);
  // Router yang gagal dibaca (mis. VPN site putus): [{router_id, router_name, error}].
  // User dari router lain tetap tampil & terus diperbarui.
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

  const fetchDhcpActive = async (isBackground = false) => {
    if (isBackground && busyRef.current) return;
    busyRef.current = true;
    const seq = ++reqSeq.current;
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
          rawText || "Failed to fetch active users"
        );
      }

      if (seq !== reqSeq.current) return;
      const rows = parsed?.data || [];
      setData(Array.isArray(rows) ? rows : []);
      setOffline(Array.isArray(parsed?.errors) ? parsed.errors : []);
      setLastUpdate(new Date().toLocaleTimeString("en-GB"));
    } catch (err) {
      if (seq !== reqSeq.current) return;
      // Polling di latar: data terakhir tetap ditampilkan, cukup tampilkan pesan error.
      if (!isBackground) { setData([]); setOffline([]); }
      setError(err.message || "Something went wrong");
    } finally {
      if (seq === reqSeq.current) {
        busyRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchDhcpActive(false);
    const id = setInterval(() => fetchDhcpActive(true), 5000);
    return () => clearInterval(id);
  }, [routerId]);

  const [sort, setSort] = useState({ key: null, dir: 1 });

  useEffect(() => { setCurrentPage(1); }, [searchTerm, routerId, rowsPerPage, sort]);

  const filteredData = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const rows = !keyword ? data : data.filter((item) =>
      [item.router_name, item.address, item["mac-address"], item["host-name"], item.status]
        .some((v) => String(v || "").toLowerCase().includes(keyword))
    );
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.get || ((r) => String(r[col.key] || "").toLowerCase());
    return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [data, searchTerm, sort]);

  // Klik kepala kolom: urut naik -> turun -> kembali ke urutan asli.
  const toggleSort = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));

  const displayedData = useMemo(() => {
    if (rowsPerPage === "all") return filteredData;
    const start = (currentPage - 1) * Number(rowsPerPage);
    return filteredData.slice(start, start + Number(rowsPerPage));
  }, [filteredData, rowsPerPage, currentPage]);

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
  const [showFilters, setShowFilters] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: NS.font, color: NS.text }}>
      <PageHeader
        title="Active Users"
        subtitle={`${data.length} devices connected (MikroTik DHCP) · updated ${lastUpdate || "—"}${offline.length ? ` · ${offline.length} router offline` : ""}`}
        actions={
          <AlertButton okText="Semua router terhubung." items={offline.length ? [{
            tone: "warn",
            title: `${offline.map((o) => o.router_name).join(", ")} offline`,
            body: <>
              Router can't be reached right now, so users at that site aren't counted. Other routers keep updating — retrying every 5 seconds.
              {offline.map((o) => (
                <div key={o.router_id} style={{ marginTop: 4, fontSize: 11.5, color: NS.label, overflowWrap: "anywhere" }}>
                  <b>{o.router_name}:</b> {o.error}
                </div>
              ))}
            </>,
          }] : []} />
        }
      />

      {error && (
        <Alert tone="bad" title="Failed to load data">
          {error}{data.length > 0 && " — showing the last data received, retrying every 5 seconds."}
        </Alert>
      )}

      {loading ? (
        <div style={{ background: NS.surface, borderRadius: 3, padding: 24, textAlign: "center", color: NS.label, fontSize: 13, boxShadow: NS_SHADOW }}>Loading active users…</div>
      ) : !(error && data.length === 0) && (
      <div style={listPanel}>
        <FilterBar open={showFilters} onToggle={() => setShowFilters((v) => !v)}>
          <FilterField label="Router">
            <select value={routerId} onChange={(e) => setRouterId(e.target.value)} style={fieldStyle}>
              {routerOptions.map((r) => {
                const n = r.value === "all" ? null : routerCounts.find((c) => c.name === r.label)?.count;
                const down = offline.some((o) => String(o.router_id) === r.value);
                return <option key={r.value} value={r.value}>{r.label}{down ? " (offline)" : n != null ? ` (${n})` : ""}</option>;
              })}
            </select>
          </FilterField>
          <FilterField label="Keyword" width={300}>
            <input type="text" placeholder="IP, MAC, hostname, router…" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} style={fieldStyle} />
          </FilterField>
        </FilterBar>

        {isMobile ? (
          displayedData.length > 0 ? displayedData.map((item, index) => (
            <MItem key={item[".id"] || `${item.address}-${index}`} i={index}
              title={<span style={{ color: NS.link }}>{item.address || "—"}</span>}
              sub={item["host-name"] || "No hostname"}
              right={<span style={{ color: NS.ok, fontWeight: 700 }}>Connected</span>}>
              <MFacts cols={2} items={[
                ["Router", item.router_name || "—"],
                ["MAC Address", item["mac-address"] || "—"],
              ]} />
            </MItem>
          )) : <EmptyState />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <SortTh label="#" style={{ width: 44, textAlign: "right" }} />
                  {COLUMNS.map((c) => (
                    <SortTh key={c.key} label={c.label} active={sort.key === c.key} dir={sort.dir}
                      onClick={c.sortable !== false ? () => toggleSort(c.key) : undefined} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedData.length > 0 ? displayedData.map((item, index) => {
                  const rk = item[".id"] || `${item.address}-${index}`;
                  return (
                    <tr key={rk} onMouseEnter={() => setHoverRow(rk)} onMouseLeave={() => setHoverRow(null)}
                      style={zebraRow(index, hoverRow === rk)}>
                      <td style={{ ...listTd, color: NS.label, textAlign: "right" }}>{rowNum(index)}</td>
                      <td style={listTd}>{item.router_name || "—"}</td>
                      <td style={{ ...listTd, color: NS.link }}>{item.address || "—"}</td>
                      <td style={{ ...listTd, color: NS.label }}>{item["mac-address"] || "—"}</td>
                      <td style={{ ...listTd, whiteSpace: "normal", overflowWrap: "anywhere" }}>{item["host-name"] || "—"}</td>
                      <td style={{ ...listTd, color: NS.label }} title={item["expires-after"] || undefined}>{leaseText(item["expires-after"])}</td>
                      <td style={listTd}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: NS.ok, fontWeight: 600 }}>
                          <Dot color={NS.ok} size={7} />Connected
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={COLUMNS.length + 1} style={{ padding: 0 }}><EmptyState /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <ListFooter total={filteredData.length} page={currentPage} perPage={rowsPerPage}
          onPage={setCurrentPage} onPerPage={setRowsPerPage} />
      </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "32px 24px" }}>
      <div style={{ color: NS.text, fontSize: 14, fontWeight: 600 }}>No data</div>
      <div style={{ color: NS.label, fontSize: 13, marginTop: 4 }}>Try a different search or router.</div>
    </div>
  );
}
