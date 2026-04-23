import { useEffect, useMemo, useState, useCallback } from "react";
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
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";

/* ─── Layout constants ─── */
const DRAWER_FULL = 264;
const DRAWER_COLLAPSED = 68;
const TOPBAR_H = 64;
const MOBILE_TOPBAR_H = 78;
const MOBILE_NAV_H = 74;

/* ─── Palette — based on #233971 ─── */
const C = {
  navy: "#233971",
  navyDeep: "#18284f",
  blue: "#233971",
  blueVibrant: "#2d4a9a",
  blueMid: "#3459c0",
  accent: "#7ea2ff",
  accentGlow: "rgba(126,162,255,0.30)",
  white: "#ffffff",
  offWhite: "#f0f4ff",
  surface: "#e8eef9",
  green: "#00d47e",
  greenGlow: "rgba(0,212,126,0.38)",
  border: "rgba(255,255,255,0.07)",
  borderLight: "rgba(35,57,113,0.10)",
  text: "#233971",
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

/* ─── Global CSS ─── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  html {
    background-color: #233971 !important;
  }

  body {
    background-color: #233971 !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    background-color: #233971 !important;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.2); }
  }

  @keyframes navFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-1px); }
  }

  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

/* ══════════════════════════════════════════
   LOGO MARK
══════════════════════════════════════════ */
function LogoMark({ size = 40, radius = "13px" }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: radius,
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
        border: `1px solid rgba(255,255,255,0.13)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow:
          "0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "50%",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)",
          borderRadius: `${radius} ${radius} 0 0`,
        },
      }}
    >
      <Box
        component="img"
        src="/piagam.png"
        alt=""
        sx={{
          width: size * 0.72,
          height: size * 0.72,
          objectFit: "contain",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.25))",
          position: "relative",
          zIndex: 1,
        }}
      />
    </Box>
  );
}

/* ══════════════════════════════════════════
   SIDEBAR CONTENT  (desktop)
══════════════════════════════════════════ */
function SidebarContent({ menus, currentMenu, onMenuClick, isCollapsed }) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.blue,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          height: TOPBAR_H,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          px: isCollapsed ? 1.5 : 2.5,
          gap: 1.5,
          justifyContent: isCollapsed ? "center" : "flex-start",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <LogoMark
          size={isCollapsed ? 38 : 42}
          radius={isCollapsed ? "12px" : "14px"}
        />
        {!isCollapsed && (
          <Box sx={{ overflow: "hidden" }}>
            <Typography
              sx={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 14.5,
                fontWeight: 700,
                color: C.white,
                letterSpacing: "-0.2px",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
              }}
            >
              Network Monitor
            </Typography>
            <Typography
              sx={{
                fontSize: 10.5,
                fontWeight: 400,
                color: "rgba(255,255,255,0.32)",
                letterSpacing: "0.01em",
                lineHeight: 1,
                whiteSpace: "nowrap",
                mt: 0.3,
              }}
            >
              PT Pilar Niaga Makmur
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          px: isCollapsed ? 1 : 1.75,
          pt: 2,
          pb: 1,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 0 },
        }}
      >
        {!isCollapsed && (
          <Typography
            sx={{
              px: 0.75,
              mb: 1.25,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.13em",
              color: "rgba(255,255,255,0.18)",
              textTransform: "uppercase",
            }}
          >
            Menu Utama
          </Typography>
        )}

        <List
          sx={{ p: 0, display: "flex", flexDirection: "column", gap: "3px" }}
        >
          {menus.map((menu) => {
            const active = currentMenu === menu.key;
            const btn = (
              <ListItemButton
                key={menu.key}
                onClick={() => onMenuClick(menu.key)}
                sx={{
                  minHeight: 44,
                  borderRadius: "11px",
                  px: isCollapsed ? 0 : 1.25,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.16s ease",
                  color: active ? C.white : "rgba(255,255,255,0.42)",
                  background: active ? alpha(C.white, 0.12) : "transparent",
                  border: `1px solid ${
                    active ? alpha(C.white, 0.16) : "transparent"
                  }`,
                  "&::before": active
                    ? {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: "20%",
                        bottom: "20%",
                        width: 2.5,
                        background: alpha(C.white, 0.72),
                        borderRadius: "0 3px 3px 0",
                      }
                    : {},
                  "&:hover": {
                    background: active
                      ? alpha(C.white, 0.16)
                      : "rgba(255,255,255,0.08)",
                    color: C.white,
                    borderColor: alpha(C.white, active ? 0.2 : 0.08),
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isCollapsed ? "unset" : 38,
                    justifyContent: isCollapsed ? "center" : "flex-start",
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "9px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active
                        ? alpha(C.white, 0.14)
                        : "rgba(255,255,255,0.055)",
                      border: `1px solid ${
                        active
                          ? alpha(C.white, 0.18)
                          : "rgba(255,255,255,0.06)"
                      }`,
                      transition: "all 0.16s ease",
                      color: active ? C.white : "rgba(255,255,255,0.48)",
                      "& .MuiSvgIcon-root": { fontSize: 15.5 },
                    }}
                  >
                    {menu.icon}
                  </Box>
                </ListItemIcon>
                {!isCollapsed && (
                  <>
                    <ListItemText
                      primary={menu.label}
                      primaryTypographyProps={{
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        letterSpacing: "-0.1px",
                      }}
                    />
                    {active && (
                      <ChevronRightRoundedIcon
                        sx={{
                          fontSize: 14,
                          color: alpha(C.white, 0.35),
                          ml: "auto",
                        }}
                      />
                    )}
                  </>
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

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
          display: "flex",
          justifyContent: isCollapsed ? "center" : "flex-start",
        }}
      >
        <Typography
          sx={{
            fontSize: 9.5,
            color: "rgba(255,255,255,0.14)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.04em",
          }}
        >
          {isCollapsed ? "v2.4" : "v2.4.1 · Network Dashboard"}
        </Typography>
      </Box>
    </Box>
  );
}

/* ══════════════════════════════════════════
   MOBILE BOTTOM NAV
══════════════════════════════════════════ */
function MobileBottomNav({ menus, currentMenu, onMenuClick }) {
  return (
    <Box
      sx={{
        position: "fixed",
        left: 14,
        right: 14,
        bottom: 12,
        zIndex: 1200,
        display: { xs: "block", md: "none" },
        borderRadius: "24px",
        background:
          "linear-gradient(180deg, rgba(49,74,137,0.96) 0%, rgba(35,57,113,0.98) 100%)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow:
          "0 20px 44px rgba(12,22,50,0.34), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.03)",
        overflow: "hidden",
        pb: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(circle at 18% 18%, rgba(255,255,255,0.12) 0%, transparent 26%),
            radial-gradient(circle at 82% 30%, rgba(126,162,255,0.14) 0%, transparent 28%),
            linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 40%, rgba(255,255,255,0.03) 100%)
          `,
        }}
      />

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.18,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='120' viewBox='0 0 320 120'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.22' stroke-width='1.1'%3E%3Cpath d='M-20 85C15 62 42 62 77 85S138 108 173 85s61-23 96 0 61 23 96 0'/%3E%3Cpath d='M-10 45C25 22 52 22 87 45S148 68 183 45s61-23 96 0 61 23 96 0'/%3E%3C/g%3E%3C/svg%3E\")",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <Box
        sx={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: `repeat(${menus.length}, 1fr)`,
          minHeight: MOBILE_NAV_H,
          px: 0.9,
          pt: 0.9,
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
                border: "none",
                background: "transparent",
                cursor: "pointer",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.55,
                minHeight: 58,
                px: 0.3,
                borderRadius: "18px",
                color: active ? C.white : "rgba(255,255,255,0.62)",
                transition: "all 0.22s ease",
                WebkitAppearance: "none",
                appearance: "none",
                WebkitTapHighlightColor: "transparent",
                outline: "none",
                "&:active": {
                  transform: "scale(0.98)",
                },
              }}
            >
              {active && (
                <>
                  <Box
                    sx={{
                      position: "absolute",
                      inset: "4px 4px 2px 4px",
                      borderRadius: "18px",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.08) 100%)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 22px rgba(6,14,34,0.20)",
                    }}
                  />
                  <Box
                    sx={{
                      position: "absolute",
                      top: 5,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 26,
                      height: 3,
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.95)",
                      boxShadow: "0 0 12px rgba(255,255,255,0.30)",
                    }}
                  />
                </>
              )}

              <Box
                sx={{
                  position: "relative",
                  zIndex: 1,
                  width: active ? 36 : 34,
                  height: active ? 36 : 34,
                  borderRadius: "13px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active
                    ? "linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.04) 100%)"
                    : "rgba(255,255,255,0.04)",
                  border: active
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid rgba(255,255,255,0.05)",
                  boxShadow: active
                    ? "0 8px 18px rgba(7,15,37,0.16)"
                    : "none",
                  transition: "all 0.22s ease",
                  animation: active ? "navFloat 3s ease-in-out infinite" : "none",
                  "& .MuiSvgIcon-root": {
                    fontSize: active ? 18.5 : 18,
                    filter: active
                      ? "drop-shadow(0 2px 7px rgba(126,162,255,0.32))"
                      : "none",
                    transition: "all 0.22s ease",
                  },
                }}
              >
                {menu.icon}
              </Box>

              <Typography
                sx={{
                  position: "relative",
                  zIndex: 1,
                  fontSize: active ? 9.2 : 8.9,
                  fontWeight: active ? 700 : 600,
                  lineHeight: 1,
                  color: "inherit",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.01em",
                  transition: "all 0.2s ease",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  textShadow: active
                    ? "0 1px 10px rgba(0,0,0,0.18)"
                    : "none",
                }}
              >
                {menu.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ══════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════ */
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
      {
        key: "dashboard",
        label: "Dashboard",
        subtitle: "Kondisi jaringan",
        icon: <DashboardRoundedIcon />,
      },
      {
        key: "user-active",
        label: "User Active",
        subtitle: "DHCP aktif",
        icon: <LanRoundedIcon />,
      },
      {
        key: "live-bandwidth",
        label: "Bandwidth",
        subtitle: "Realtime monitoring",
        icon: <WifiRoundedIcon />,
      },
    ],
    []
  );

  const handleMenuClick = useCallback(
    (key) => {
      if (onMenuChange) onMenuChange(key);
    },
    [onMenuChange]
  );

  const meta = menuMeta[currentMenu] || {};

  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) =>
      el.remove()
    );
    const m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    m.setAttribute("content", C.blue);
    document.head.appendChild(m);

    document
      .querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')
      .forEach((el) => el.remove());
    const appleStatusBar = document.createElement("meta");
    appleStatusBar.setAttribute(
      "name",
      "apple-mobile-web-app-status-bar-style"
    );
    appleStatusBar.setAttribute("content", "default");
    document.head.appendChild(appleStatusBar);

    document.documentElement.style.backgroundColor = C.blue;
    document.body.style.backgroundColor = C.blue;

    const root = document.getElementById("root");
    if (root) {
      root.style.backgroundColor = C.blue;
    }

    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      if (root) {
        root.style.backgroundColor = "";
      }
    };
  }, []);

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          backgroundColor: "#dfe7f8",
          position: "relative",
          overflow: "hidden",
          backgroundImage: `
            radial-gradient(1500px 520px at 50% -6%, rgba(35,57,113,0.16) 0%, rgba(35,57,113,0.08) 28%, transparent 68%),
            radial-gradient(1200px 520px at -10% 18%, rgba(45,74,154,0.12) 0%, rgba(45,74,154,0.06) 30%, transparent 72%),
            radial-gradient(1200px 520px at 110% 16%, rgba(52,89,192,0.10) 0%, rgba(52,89,192,0.05) 30%, transparent 72%),
            radial-gradient(900px 320px at 50% 24%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.12) 36%, transparent 76%),
            linear-gradient(180deg, #d8e2f3 0%, #e8eef8 22%, #edf2fa 48%, #dfe7f6 100%)
          `,
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            opacity: 0.5,
            backgroundImage: `
              url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1800' height='1200' viewBox='0 0 1800 1200'%3E%3Cg fill='none' stroke='%23233971' stroke-opacity='0.24' stroke-width='2.2'%3E%3Cpath d='M-180 180C40 40 220 40 440 180S840 320 1060 180s400-140 620 0 400 140 620 0'/%3E%3Cpath d='M-180 360C40 220 220 220 440 360S840 500 1060 360s400-140 620 0 400 140 620 0'/%3E%3Cpath d='M-180 540C40 400 220 400 440 540S840 680 1060 540s400-140 620 0 400 140 620 0'/%3E%3Cpath d='M-180 720C40 580 220 580 440 720S840 860 1060 720s400-140 620 0 400 140 620 0'/%3E%3C/g%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.18' stroke-width='1.4'%3E%3Cellipse cx='320' cy='230' rx='180' ry='66'/%3E%3Cellipse cx='900' cy='170' rx='250' ry='88'/%3E%3Cellipse cx='1480' cy='280' rx='190' ry='70'/%3E%3C/g%3E%3C/svg%3E")
            `,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            mixBlendMode: "multiply",
          },
        }}
      >
        <CssBaseline />

        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            top: 0,
            left: 0,
            right: 0,
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: `${drawerWidth}px` },
            height: {
              xs: `calc(${MOBILE_TOPBAR_H}px + env(safe-area-inset-top, 0px))`,
              md: `${TOPBAR_H}px`,
            },
            backgroundColor: C.blue,
            backgroundImage: "none",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 0,
            overflow: "hidden",
            color: C.white,
            transition:
              "width 0.28s cubic-bezier(0.4,0,0.2,1), margin 0.28s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: {
              xs: "0 2px 0 rgba(255,255,255,0.05), 0 10px 28px rgba(15,25,55,0.24)",
              md: "0 2px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(15,25,55,0.12)",
            },
            "&::before": {
              content: '""',
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 35%, rgba(0,0,0,0.04) 100%)
              `,
            },
            "&::after": {
              content: '""',
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: 0.18,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='260' viewBox='0 0 1600 260'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.24' stroke-width='1.2'%3E%3Cpath d='M-80 110C70 35 180 35 330 110S590 185 740 110s260-75 410 0 260 75 410 0 260-75 410 0'/%3E%3Cpath d='M-80 190C70 115 180 115 330 190S590 265 740 190s260-75 410 0 260 75 410 0 260-75 410 0'/%3E%3C/g%3E%3C/svg%3E\")",
              backgroundSize: "cover",
              backgroundPosition: "center",
            },
          }}
        >
          <Toolbar
            sx={{
              display: { xs: "none", md: "flex" },
              height: TOPBAR_H,
              minHeight: `${TOPBAR_H}px !important`,
              px: 3,
              gap: 2,
              position: "relative",
              zIndex: 1,
            }}
          >
            <IconButton
              onClick={() => setCollapsed((p) => !p)}
              size="small"
              sx={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                border: `1px solid ${alpha(C.white, 0.12)}`,
                background: alpha(C.white, 0.06),
                color: alpha(C.white, 0.86),
                flexShrink: 0,
                transition: "all 0.16s ease",
                "&:hover": {
                  background: alpha(C.white, 0.12),
                  color: C.white,
                  borderColor: alpha(C.white, 0.18),
                },
              }}
            >
              {collapsed ? (
                <MenuIcon sx={{ fontSize: 17 }} />
              ) : (
                <MenuOpenIcon sx={{ fontSize: 17 }} />
              )}
            </IconButton>

            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color: C.white,
                    letterSpacing: "-0.4px",
                    lineHeight: 1.15,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {meta.title || title}
                </Typography>
                {meta.subtitle && (
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: alpha(C.white, 0.56),
                      mt: 0.35,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {meta.subtitle}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.7,
                    px: 1.2,
                    py: 0.72,
                    borderRadius: "999px",
                    background: alpha(C.white, 0.07),
                    border: `1px solid ${alpha(C.white, 0.10)}`,
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: C.green,
                      boxShadow: `0 0 10px ${C.greenGlow}`,
                      animation: "pulse 2.4s ease-in-out infinite",
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: C.white,
                      lineHeight: 1,
                      letterSpacing: "0.01em",
                    }}
                  >
                    Live Monitoring
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Toolbar>

          <Toolbar
            disableGutters
            sx={{
              display: { xs: "flex", md: "none" },
              height: "100%",
              minHeight: "unset !important",
              flexDirection: "column",
              alignItems: "stretch",
              px: 0,
              pb: 0,
              position: "relative",
              zIndex: 2,
              overflow: "visible",
              backgroundColor: C.blue,
              backgroundImage: "none",
              pt: "env(safe-area-inset-top, 0px)",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: `
                  linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 35%, rgba(0,0,0,0.04) 100%)
                `,
              }}
            />

            <Box
              sx={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                opacity: 0.18,
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='260' viewBox='0 0 1600 260'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.24' stroke-width='1.2'%3E%3Cpath d='M-80 110C70 35 180 35 330 110S590 185 740 110s260-75 410 0 260 75 410 0 260-75 410 0'/%3E%3Cpath d='M-80 190C70 115 180 115 330 190S590 265 740 190s260-75 410 0 260 75 410 0 260-75 410 0'/%3E%3C/g%3E%3C/svg%3E\")",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            <Box
              sx={{
                px: 2,
                pt: 0.95,
                pb: 0.95,
                display: "flex",
                alignItems: "center",
                gap: 1.1,
                minHeight: MOBILE_TOPBAR_H,
                position: "relative",
                zIndex: 1,
              }}
            >
              <LogoMark size={50} radius="14px" />

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 17,
                    fontWeight: 700,
                    color: C.white,
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {meta.title || title}
                </Typography>

                {meta.subtitle && (
                  <Typography
                    sx={{
                      mt: 0.35,
                      fontSize: 10.5,
                      fontWeight: 500,
                      color: alpha(C.white, 0.62),
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {meta.subtitle}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 0.9,
                  py: 0.5,
                  borderRadius: "999px",
                  background: alpha(C.white, 0.08),
                  border: `1px solid ${alpha(C.white, 0.10)}`,
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: C.green,
                    boxShadow: `0 0 8px ${C.greenGlow}`,
                    animation: "pulse 2.4s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.white,
                    lineHeight: 1,
                  }}
                >
                  Live
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                height: "1px",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
                background: `linear-gradient(90deg, transparent, ${alpha(
                  C.white,
                  0.16
                )} 25%, ${alpha(C.white, 0.16)} 75%, transparent)`,
              }}
            />
          </Toolbar>
        </AppBar>

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
                  boxShadow:
                    "1px 0 0 rgba(255,255,255,0.04), 8px 0 24px rgba(15,25,55,0.10)",
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
          <Box
            sx={{
              height: {
                xs: `calc(${MOBILE_TOPBAR_H}px + env(safe-area-inset-top, 0px))`,
                md: `${TOPBAR_H}px`,
              },
              flexShrink: 0,
            }}
          />

          <Box
            sx={{
              flex: 1,
              p: { xs: 2, md: 3.5 },
              position: "relative",
              zIndex: 1,
            }}
          >
            {children}
          </Box>

          <Box
            component="footer"
            sx={{
              px: { xs: 2, md: 3.5 },
              pb: {
                xs: `calc(${MOBILE_NAV_H}px + env(safe-area-inset-bottom, 0px) + 28px)`,
                md: 3,
              },
            }}
          >
            <Box
              sx={{
                borderTop: `1px solid ${C.borderLight}`,
                pt: 2,
                display: { xs: "none", md: "flex" },
                justifyContent: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: 11.5,
                  color: alpha(C.text, 0.55),
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  px: 1.5,
                  py: 0.75,
                  borderRadius: "99px",
                  background: alpha(C.white, 0.55),
                  border: `1px solid ${alpha(C.text, 0.08)}`,
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                Network Dashboard · PT Pilar Niaga Makmur
              </Typography>
            </Box>
          </Box>
        </Box>

        <MobileBottomNav
          menus={menus}
          currentMenu={currentMenu}
          onMenuClick={handleMenuClick}
        />
      </Box>
    </>
  );
}