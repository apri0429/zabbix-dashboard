import { useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import DhcpActive from "./pages/DhcpActive";
import Livebandwotdh from "./pages/Livebanditdh";

export default function App() {
  const [currentMenu, setCurrentMenu] = useState("dashboard");

  return (
    <Layout
      title={
        currentMenu === "dashboard"
          ? "Dashboard"
          : currentMenu === "user-active"
          ? "User Active"
          : currentMenu === "live-bandwidth"
          ? "Live Bandwidth"
          : "Dashboard"
      }
      currentMenu={currentMenu}
      onMenuChange={setCurrentMenu}
    >
      {currentMenu === "dashboard" ? (
        <Dashboard />
      ) : currentMenu === "user-active" ? (
        <DhcpActive />
      ) : currentMenu === "live-bandwidth" ? (
        <Livebandwotdh />
      ) : (
        <Dashboard />
      )}
    </Layout>
  );
} 