import { Component, useState, useEffect, lazy, Suspense } from "react";
import Layout from "./components/Layout";
import ChatWidget from "./components/ChatWidget";

// Setelah build baru, nama file halaman berubah. Browser yang masih memegang versi
// lama akan gagal memuat file halaman; dalam kasus itu muat ulang sekali saja
// supaya browser mengambil versi terbaru.
const RELOAD_KEY = "netrowatch-chunk-reload";
function lazyPage(load) {
  return lazy(() =>
    load()
      .then((mod) => {
        try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* abaikan */ }
        return mod;
      })
      .catch((err) => {
        let reloaded = false;
        try { reloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; } catch { /* abaikan */ }
        if (!reloaded) {
          try { sessionStorage.setItem(RELOAD_KEY, "1"); } catch { /* abaikan */ }
          window.location.reload();
          return new Promise(() => {}); // tunggu reload
        }
        throw err;
      }),
  );
}

// Tiap halaman dimuat saat dibuka saja, supaya pembukaan pertama lebih cepat.
const Dashboard      = lazyPage(() => import("./pages/Dashboard"));
const TrafficReport  = lazyPage(() => import("./pages/TrafficReport"));
const DhcpActive     = lazyPage(() => import("./pages/DhcpActive"));
const Livebandwotdh  = lazyPage(() => import("./pages/Livebanditdh"));
const MikrotikStatus = lazyPage(() => import("./pages/MikrotikStatus"));
const NetworkLog     = lazyPage(() => import("./pages/NetworkLog"));

const PAGES = {
  "dashboard":      { title: "Dashboard",        Page: Dashboard },
  "laporan":        { title: "Traffic Report",   Page: TrafficReport },
  "catatan":        { title: "Network Log",      Page: NetworkLog },
  "user-active":    { title: "Active Users",     Page: DhcpActive },
  "live-bandwidth": { title: "Live Bandwidth",   Page: Livebandwotdh },
  "mikrotik":       { title: "MikroTik",         Page: MikrotikStatus },
};

const PageLoading = () => (
  <div style={{ padding: 24, textAlign: "center", color: "#666", fontSize: 13 }}>Memuat halaman…</div>
);

// Kalau satu halaman error, tampilkan pesan + tombol muat ulang, bukan layar kosong.
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.pageKey !== this.props.pageKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: "14px 16px", background: "#fccfcf", borderRadius: 3, fontSize: 13, color: "#333", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: "#c62828", fontSize: 14 }}>Halaman ini gagal dibuka</div>
        Kemungkinan aplikasi baru saja diperbarui. Muat ulang halaman untuk mengambil versi terbaru.
        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{String(this.state.error?.message || this.state.error)}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ marginTop: 8, padding: "5px 14px", borderRadius: 3, border: "1px solid #2a5db0", background: "#2a5db0", color: "#fff", fontWeight: 600, cursor: "pointer" }}
        >
          Muat ulang
        </button>
      </div>
    );
  }
}

export default function App() {
  const [currentMenu, setCurrentMenu] = useState("dashboard");
  const { title, Page } = PAGES[currentMenu] ?? PAGES.dashboard;

  // Judul tab browser ikut halaman yang sedang dibuka.
  useEffect(() => {
    document.title = `${title} · NetroWatch`;
  }, [title]);

  return (
    <Layout title={title} currentMenu={currentMenu} onMenuChange={setCurrentMenu}>
      <PageErrorBoundary pageKey={currentMenu}>
        <Suspense fallback={<PageLoading />}>
          <Page />
        </Suspense>
      </PageErrorBoundary>
      <ChatWidget />
    </Layout>
  );
}
