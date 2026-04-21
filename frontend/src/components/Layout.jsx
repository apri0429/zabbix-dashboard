import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import LanRoundedIcon from "@mui/icons-material/LanRounded";
import WifiRoundedIcon from "@mui/icons-material/WifiRounded";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";

/* ─── Constants ─── */
const DRAWER_FULL = 260;
const DRAWER_COLLAPSED = 72;
const TOPBAR_H = 72;
const MOBILE_TOPBAR_H = 120;
const MOBILE_NAV_H = 78;

/* ─── Design Tokens ─── */
const T = {
  ink: "#233971",
  ink80: "rgba(35,57,113,0.80)",
  ink50: "rgba(35,57,113,0.50)",
  ink20: "rgba(35,57,113,0.20)",
  ink08: "rgba(35,57,113,0.08)",
  paper: "#f5f4f0",
  paper2: "#eeede8",
  white: "#ffffff",
  accent: "#233971",
  accentSoft: "rgba(35,57,113,0.12)",
  accentGlow: "rgba(35,57,113,0.25)",
  green: "#00c875",
  greenSoft: "rgba(0,200,117,0.12)",
  amber: "#f59e0b",
  red: "#ef4444",
};

const menuMeta = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Ringkasan kondisi jaringan secara keseluruhan",
  },
  "user-active": {
    title: "User Active",
    subtitle: "Daftar user DHCP yang sedang aktif",
  },
  "live-bandwidth": {
    title: "Live Bandwidth",
    subtitle: "Monitoring realtime queue tree bandwidth",
  },
};

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,200,117,0.55); }
    50%       { box-shadow: 0 0 0 5px rgba(0,200,117,0); }
  }
  @keyframes livePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.6; transform: scale(1.15); }
  }
`;

/* ═══════════════════════════════════════════════
   SIDEBAR CONTENT
═══════════════════════════════════════════════ */
function SidebarContent({ menus, currentMenu, onMenuClick, isCollapsed }) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: T.ink,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Noise-texture overlay */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E")`,
          opacity: 0.45,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: -100,
          right: -100,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.accentGlow} 0%, transparent 68%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: -60,
          left: -60,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Brand ── */}
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          px: isCollapsed ? 1.5 : 2.5,
          height: `${TOPBAR_H}px`,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${T.accent} 0%, #5c7cff 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
            boxShadow: `0 6px 20px ${T.accentGlow}`,
            mx: isCollapsed ? "auto" : 0,
            "&::after": {
              content: '""',
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 60%)",
            },
          }}
        >
          <WifiRoundedIcon sx={{ fontSize: 20, color: "#ffffff", position: "relative", zIndex: 1 }} />
        </Box>
        {!isCollapsed && (
          <Box sx={{ overflow: "hidden", minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 15,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.3px",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              Network Monitor
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: "rgba(255,255,255,0.38)",
                mt: 0.25,
                whiteSpace: "nowrap",
                fontWeight: 400,
                letterSpacing: "0.02em",
              }}
            >
              PT Pilar Niaga Makmur
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Status pill ── */}
      {!isCollapsed && (
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            mx: 2,
            mt: 1.75,
            px: 1.75,
            py: 1.25,
            borderRadius: "12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flexShrink: 0,
          }}
        >
          <FiberManualRecordIcon
            sx={{ fontSize: 7, color: T.green, animation: "glowPulse 2s ease-in-out infinite" }}
          />
          <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500, flex: 1 }}>
            Sistem Aktif
          </Typography>
          <Box
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: T.green,
              background: "rgba(0,200,117,0.12)",
              border: "1px solid rgba(0,200,117,0.2)",
              px: 1,
              py: 0.25,
              borderRadius: "99px",
              letterSpacing: "0.04em",
            }}
          >
            Online
          </Box>
        </Box>
      )}

      {/* ── Nav ── */}
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          px: isCollapsed ? 1 : 1.5,
          py: 2,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 0 },
        }}
      >
        {!isCollapsed && (
          <Typography
            sx={{
              px: 1,
              mb: 1,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.22)",
              textTransform: "uppercase",
            }}
          >
            Navigasi
          </Typography>
        )}
        <List sx={{ p: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
          {menus.map((menu) => {
            const active = currentMenu === menu.key;
            const btn = (
              <ListItemButton
                key={menu.key}
                onClick={() => onMenuClick(menu.key)}
                sx={{
                  minHeight: 46,
                  borderRadius: "12px",
                  px: isCollapsed ? 0 : 1.5,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.55)",
                  background: active
                    ? "linear-gradient(135deg, rgba(26,63,255,0.22) 0%, rgba(92,124,255,0.14) 100%)"
                    : "transparent",
                  border: "1px solid",
                  borderColor: active ? "rgba(26,63,255,0.30)" : "transparent",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.18s ease",
                  "&::before": active
                    ? {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: "25%",
                        bottom: "25%",
                        width: 3,
                        background: T.accent,
                        borderRadius: "0 3px 3px 0",
                      }
                    : {},
                  "&:hover": {
                    background: active
                      ? "linear-gradient(135deg, rgba(26,63,255,0.26) 0%, rgba(92,124,255,0.18) 100%)"
                      : "rgba(255,255,255,0.07)",
                    color: "#ffffff",
                    borderColor: active ? "rgba(26,63,255,0.36)" : "rgba(255,255,255,0.06)",
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isCollapsed ? "unset" : 42,
                    justifyContent: isCollapsed ? "center" : "flex-start",
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active ? "rgba(26,63,255,0.30)" : "rgba(255,255,255,0.06)",
                      transition: "background 0.18s",
                      color: active ? "#ffffff" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {menu.icon}
                  </Box>
                </ListItemIcon>
                {!isCollapsed && (
                  <ListItemText
                    primary={menu.label}
                    primaryTypographyProps={{
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 500,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                )}
              </ListItemButton>
            );

            return isCollapsed ? (
              <Tooltip key={menu.key} title={menu.label} placement="right" arrow>
                {btn}
              </Tooltip>
            ) : (
              <Box key={menu.key}>{btn}</Box>
            );
          })}
        </List>
      </Box>

      {/* ── Version ── */}
      {!isCollapsed && (
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            px: 2.5,
            py: 1.75,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              textAlign: "center",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            v2.4.1 · Zabbix API
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   MOBILE BOTTOM NAV
═══════════════════════════════════════════════ */
function MobileBottomNav({ menus, currentMenu, onMenuClick }) {
  return (
    <Box
      sx={{
        position: "fixed",
        left: 14,
        right: 14,
        bottom: 14,
        zIndex: (theme) => theme.zIndex.appBar + 2,
        display: { xs: "block", md: "none" },
      }}
    >
      <Box
        sx={{
          borderRadius: "26px",
          px: 0.75,
          py: 0.75,
          background: T.accent,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: `0 16px 40px ${alpha(T.ink, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${menus.length}, minmax(0, 1fr))`,
            gap: 0.75,
          }}
        >
          {menus.map((menu) => {
            const active = currentMenu === menu.key;
            return (
              <Box
                key={menu.key}
                component="button"
                type="button"
                onClick={() => onMenuClick(menu.key)}
                sx={{
                  minWidth: 0,
                  px: 0.75,
                  py: 0.8,
                  width: "100%",
                  borderRadius: "16px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.45,
                  border: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  color: active ? T.white : "rgba(255,255,255,0.58)",
                  background: active
                    ? "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 100%)"
                    : "transparent",
                  outline: active ? "1px solid rgba(255,255,255,0.16)" : "1px solid transparent",
                  boxShadow: active ? `0 8px 18px ${alpha("#091227", 0.18)}` : "none",
                  transition: "all 0.18s ease",
                  "&:active": { transform: "scale(0.97)" },
                }}
              >
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  {menu.icon}
                </Box>
                <Typography
                  sx={{
                    fontSize: 10,
                    lineHeight: 1.15,
                    fontWeight: active ? 700 : 500,
                    textAlign: "center",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {menu.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════ */
export default function Layout({
  children,
  title = "Dashboard",
  currentMenu = "dashboard",
  onMenuChange,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [collapsed, setCollapsed] = useState(false);

  const isCollapsed = !isMobile && collapsed;
  const drawerWidth = isMobile
    ? DRAWER_FULL
    : collapsed
    ? DRAWER_COLLAPSED
    : DRAWER_FULL;

  const menus = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: <DashboardRoundedIcon sx={{ fontSize: 17 }} /> },
      { key: "user-active", label: "User Active", icon: <LanRoundedIcon sx={{ fontSize: 17 }} /> },
      { key: "live-bandwidth", label: "Live Bandwidth", icon: <WifiRoundedIcon sx={{ fontSize: 17 }} /> },
    ],
    []
  );

  const handleDrawerToggle = () => {
    if (!isMobile) setCollapsed((p) => !p);
  };

  const handleMenuClick = (key) => {
    if (onMenuChange) onMenuChange(key);
  };

  const meta = menuMeta[currentMenu] || {};
  const greeting = getTimeGreeting();
  const currentMenuLabel = menus.find((menu) => menu.key === currentMenu)?.label || title;

  useEffect(() => {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement("meta");
      themeColorMeta.setAttribute("name", "theme-color");
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute("content", "#1a2f6b");
  }, []);

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          fontFamily: "'DM Sans', sans-serif",
          background: T.paper,
          position: "relative",
          overflow: "hidden",

          /* background utama lebih jelas */
          backgroundImage: `
            radial-gradient(circle at 12% 26%, rgba(244, 235, 223, 0.96) 0%, rgba(244, 235, 223, 0.72) 10%, transparent 20%),
            radial-gradient(circle at 78% 18%, rgba(198, 220, 247, 0.88) 0%, rgba(198, 220, 247, 0.42) 11%, transparent 23%),
            radial-gradient(circle at 84% 70%, rgba(244, 235, 223, 0.82) 0%, rgba(244, 235, 223, 0.30) 13%, transparent 27%),
            linear-gradient(180deg, #f9fbfe 0%, #eef3f8 100%)
          `,

          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage: `radial-gradient(rgba(104, 138, 188, 0.20) 1.15px, transparent 1.15px)`,
            backgroundSize: { xs: "16px 16px", md: "18px 18px" },
            opacity: 0.42,
          },

          "&::after": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            background: `
              radial-gradient(ellipse 43% 16% at 8% 100%, rgba(236, 227, 214, 0.96) 0%, rgba(236, 227, 214, 0.64) 42%, rgba(236, 227, 214, 0.18) 52%, transparent 53%),
              radial-gradient(ellipse 48% 18% at 82% 100%, rgba(204, 214, 227, 0.96) 0%, rgba(204, 214, 227, 0.68) 44%, rgba(204, 214, 227, 0.18) 56%, transparent 57%),
              linear-gradient(170deg, transparent 0%, transparent 26%, rgba(191, 205, 224, 0.62) 26.5%, rgba(191, 205, 224, 0.62) 34%, transparent 34.5%)
            `,
          },
        }}
      >
        <CssBaseline />

        {/* dekorasi background tambahan supaya lebih kelihatan */}
        <Box
          sx={{
            position: "absolute",
            top: { xs: 126, md: 132 },
            right: { xs: 18, md: 88 },
            width: { xs: 112, md: 220 },
            height: { xs: 62, md: 92 },
            opacity: 0.40,
            pointerEvents: "none",
            backgroundImage: `radial-gradient(rgba(111, 145, 196, 0.95) 1.8px, transparent 1.8px)`,
            backgroundSize: "16px 16px",
            zIndex: 0,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            top: { xs: -112, md: -145 },
            left: { xs: -150, md: -260 },
            width: { xs: 440, md: 760 },
            height: { xs: 220, md: 320 },
            borderRadius: "0 0 999px 999px",
            background: "rgba(210, 219, 232, 0.72)",
            transform: "rotate(-6deg)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            top: { xs: -30, md: -46 },
            left: { xs: "24%", md: "25%" },
            width: { xs: 300, md: 620 },
            height: { xs: 120, md: 220 },
            borderRadius: "0 0 180px 180px",
            background: "rgba(186, 201, 223, 0.48)",
            transform: "rotate(-10deg)",
            pointerEvents: "none",
            filter: "blur(0.5px)",
            zIndex: 0,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            top: { xs: 82, md: 92 },
            left: { xs: -90, md: -145 },
            width: { xs: 360, md: 620 },
            height: { xs: 140, md: 205 },
            borderRadius: "999px",
            background: "rgba(220, 226, 236, 0.58)",
            transform: "rotate(-8deg)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            bottom: { xs: -40, md: -30 },
            left: { xs: -60, md: -90 },
            width: { xs: 340, md: 480 },
            height: { xs: 150, md: 220 },
            borderRadius: "50%",
            border: "18px solid rgba(236, 227, 214, 0.95)",
            opacity: 0.85,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <Box
          sx={{
            position: "absolute",
            bottom: { xs: -80, md: -40 },
            right: { xs: -120, md: -150 },
            width: { xs: 420, md: 760 },
            height: { xs: 180, md: 260 },
            borderRadius: "50%",
            background: "linear-gradient(180deg, rgba(206,215,227,0.76) 0%, rgba(206,215,227,0.98) 100%)",
            opacity: 0.95,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* ── AppBar ── */}
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: `${drawerWidth}px` },
            height: { xs: `${MOBILE_TOPBAR_H}px`, md: `${TOPBAR_H}px` },
            background: {
              xs: T.accent,
              md: `linear-gradient(180deg, ${alpha(T.accent, 0.14)} 0%, ${alpha("#ffffff", 0.92)} 82%)`,
            },
            backdropFilter: { xs: "none", md: "blur(20px)" },
            WebkitBackdropFilter: { xs: "none", md: "blur(20px)" },
            borderRadius: 0,
            overflow: "visible",
            color: { xs: T.white, md: T.accent },
            transition: "width 0.28s cubic-bezier(0.4,0,0.2,1), margin 0.28s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "none",

            /* lengkungan mobile — background mengikuti tema halaman */
            "&::before": {
              content: '""',
              display: { xs: "block", md: "none" },
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -1,
              height: 30,
              background: "linear-gradient(180deg, #f9fbfe 0%, #eef3f8 100%)",
              backgroundImage: `
                radial-gradient(circle at 12% 50%, rgba(244, 235, 223, 0.96) 0%, rgba(244, 235, 223, 0.72) 30%, transparent 60%),
                radial-gradient(circle at 88% 50%, rgba(198, 220, 247, 0.88) 0%, rgba(198, 220, 247, 0.42) 30%, transparent 60%),
                linear-gradient(180deg, #f9fbfe 0%, #eef3f8 100%)
              `,
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              zIndex: 0,
            },
            "&::after": {
              content: '""',
              display: { xs: "none", md: "none" },
            },
          }}
        >
          {/* ════ DESKTOP TOOLBAR — identik 100% dengan asli ════ */}
          <Toolbar
            sx={{
              display: { xs: "none", md: "flex" },
              height: `${TOPBAR_H}px`,
              minHeight: `${TOPBAR_H}px !important`,
              px: 3.5,
              gap: 2,
            }}
          >
            <IconButton
              onClick={handleDrawerToggle}
              size="small"
              sx={{
                width: 38,
                height: 38,
                borderRadius: "10px",
                border: `1px solid ${alpha(T.accent, 0.16)}`,
                background: `linear-gradient(180deg, ${alpha(T.white, 0.96)} 0%, ${alpha(T.accent, 0.06)} 100%)`,
                color: T.accent,
                flexShrink: 0,
                boxShadow: `0 6px 18px ${alpha(T.accent, 0.10)}`,
                transition: "all 0.15s ease",
                "&:hover": { background: T.accent, borderColor: T.accent, color: T.white },
              }}
            >
              {collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}
            </IconButton>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  color: T.accent,
                  letterSpacing: "-0.4px",
                  lineHeight: 1.2,
                }}
              >
                {meta.title || title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: alpha(T.accent, 0.72), mt: 0.25, lineHeight: 1.3 }}>
                {meta.subtitle || ""}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                px: 1.75,
                py: 1,
                borderRadius: "99px",
                border: `1px solid ${T.ink08}`,
                background: T.white,
                boxShadow: "0 2px 8px rgba(10,14,26,0.05)",
              }}
            >
              <Box
                component="svg"
                viewBox="0 0 24 24"
                fill="none"
                sx={{ width: 13, height: 13, stroke: alpha(T.accent, 0.72), strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: alpha(T.accent, 0.84) }}>
                {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.75,
                py: 1,
                borderRadius: "99px",
                background: `linear-gradient(180deg, ${alpha(T.accent, 0.96)} 0%, ${alpha("#1b2d5b", 0.96)} 100%)`,
                color: T.white,
                boxShadow: `0 8px 22px ${alpha(T.accent, 0.30)}`,
                border: `1px solid ${alpha(T.white, 0.10)}`,
              }}
            >
              <FiberManualRecordIcon sx={{ fontSize: 7, color: "#9fc0ff", animation: "livePulse 2s ease-in-out infinite" }} />
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: T.white }}>Live</Typography>
            </Box>
          </Toolbar>

          {/* ════ MOBILE TOOLBAR — rapi, satu baris ════ */}
          <Toolbar
            disableGutters
            sx={{
              display: { xs: "flex", md: "none" },
              height: `${MOBILE_TOPBAR_H}px`,
              minHeight: `${MOBILE_TOPBAR_H}px !important`,
              px: 2.5,
              pt: "max(env(safe-area-inset-top), 12px)",
              pb: "22px",
              alignItems: "center",
              gap: 1.5,
              position: "relative",
              zIndex: 1,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: alpha(T.white, 0.6),
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}
              >
                {greeting}
              </Typography>
              <Typography
                sx={{
                  mt: 0.5,
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: T.white,
                  lineHeight: 1.15,
                  letterSpacing: "-0.04em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta.title || title}
              </Typography>
              <Typography
                sx={{
                  mt: 0.35,
                  fontSize: 11,
                  color: alpha(T.white, 0.5),
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {meta.subtitle || ""}
              </Typography>
            </Box>

            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                px: 1.4,
                py: 0.85,
                borderRadius: "99px",
                background: alpha(T.white, 0.13),
                border: `1px solid ${alpha(T.white, 0.14)}`,
              }}
            >
              <FiberManualRecordIcon
                sx={{ fontSize: 7, color: T.green, animation: "livePulse 2s ease-in-out infinite" }}
              />
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: T.white, whiteSpace: "nowrap" }}>
                {currentMenuLabel}
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        {/* ── Drawer nav ── */}
        <Box
          component="nav"
          sx={{
            width: { md: drawerWidth },
            flexShrink: { md: 0 },
            transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {!isMobile && (
            <Drawer
              variant="permanent"
              open
              sx={{
                "& .MuiDrawer-paper": {
                  width: drawerWidth,
                  border: "none",
                  transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)",
                  overflowX: "hidden",
                  boxShadow: "8px 0 32px rgba(10,14,26,0.12)",
                },
              }}
            >
              <SidebarContent
                menus={menus}
                currentMenu={currentMenu}
                onMenuClick={handleMenuClick}
                isCollapsed={isCollapsed}
              />
            </Drawer>
          )}
        </Box>

        {/* ── Main area ── */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
            transition: "all 0.28s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Spacer for fixed appbar */}
          <Box sx={{ height: { xs: `${MOBILE_TOPBAR_H}px`, md: `${TOPBAR_H}px` }, flexShrink: 0 }} />

          {/* Page content */}
          <Box
            sx={{
              flex: 1,
              p: { xs: 2, md: 3.5 },
              pb: { xs: 2, md: 3.5 },
              mt: { xs: "-6px", md: 0 },
              position: "relative",
              zIndex: 1,
            }}
          >
            {children}
          </Box>

          {/* Footer */}
          <Box
            component="footer"
            sx={{
              px: { xs: 2, md: 3.5 },
              pb: { xs: `calc(${MOBILE_NAV_H}px + 20px)`, md: 3 },
            }}
          >
            <Box
              sx={{
                borderTop: `1px solid ${T.ink08}`,
                pt: 2,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Typography
                sx={{
                  display: { xs: "none", md: "block" },
                  fontSize: 11,
                  color: T.ink50,
                  textAlign: "center",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                }}
              >
                Network Dashboard · PT Pilar Niaga Makmur
              </Typography>
            </Box>
          </Box>
        </Box>

        <MobileBottomNav menus={menus} currentMenu={currentMenu} onMenuClick={handleMenuClick} />
      </Box>
    </>
  );
}