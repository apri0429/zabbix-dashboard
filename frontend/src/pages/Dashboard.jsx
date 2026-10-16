import { useEffect, useState } from "react";
import dayjs from "dayjs";
import Overview from "../components/Overview";
import NocView from "./NocView";
import { NS, PageHeader, btn } from "../components/ns";

const fmtTanggal = (d) => d.format("dddd, D MMMM YYYY");

/* Dashboard = ringkasan kondisi jaringan + daftar perangkat.
   Laporan trafik per periode ada di halaman Traffic Report. */
export default function Dashboard() {
  const [clock, setClock] = useState(() => dayjs());
  // Naik tiap tombol "Laporan Mingguan" diklik; NocView membuka jendela laporannya.
  const [reportSignal, setReportSignal] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setClock(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", fontFamily: NS.font, color: NS.text }}>
      <PageHeader
        title="Dashboard"
        subtitle={`Network health overview for PT Pilar Niaga Makmur · ${fmtTanggal(clock)}, ${clock.format("HH:mm:ss")}`}
        actions={
          <button type="button" onClick={() => setReportSignal((n) => n + 1)} style={btn(true)}>
            Weekly Report
          </button>
        }
      />

      <Overview />

      <NocView mode="devices" reportSignal={reportSignal} />
    </div>
  );
}
