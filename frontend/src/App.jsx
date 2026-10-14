import { useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import DhcpActive from "./pages/DhcpActive";
import Livebandwotdh from "./pages/Livebanditdh";
import MikrotikStatus from "./pages/MikrotikStatus";
import NocView from "./pages/NocView";
import IspHistory from "./pages/IspHistory";

const PAGE_TITLES = {
  "dashboard":      "Dashboard",
  "noc":            "NOC Monitor",
  "isp":            "Catatan ISP",
  "devices":        "Catatan Perangkat",
  "user-active":    "User Active",
  "live-bandwidth": "Live Bandwidth",
  "mikrotik":       "Mikrotik",
};

export default function App() {
  const [currentMenu, setCurrentMenu] = useState("dashboard");

  return (
    <Layout
      title={PAGE_TITLES[currentMenu] ?? "Dashboard"}
      currentMenu={currentMenu}
      onMenuChange={setCurrentMenu}
    >
      {currentMenu === "dashboard" ? (
        <Dashboard />
      ) : currentMenu === "noc" ? (
        <NocView />
      ) : currentMenu === "isp" ? (
        <IspHistory mode="isp" />
      ) : currentMenu === "devices" ? (
        <IspHistory mode="device" />
      ) : currentMenu === "user-active" ? (
        <DhcpActive />
      ) : currentMenu === "live-bandwidth" ? (
        <Livebandwotdh />
      ) : currentMenu === "mikrotik" ? (
        <MikrotikStatus />
      ) : (
        <Dashboard />
      )}
    </Layout>
  );
} 