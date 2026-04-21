import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",

    primary: {
      main: "#ab884c",
      light: "#c7a96e",
      dark: "#8c6e3a",
      contrastText: "#ffffff",
    },

    background: {
      default: "#f7f8fa",
      paper: "#ffffff",
    },

    success: {
      main: "#5ac85a",
    },

    warning: {
      main: "#ffbe50",
    },

    error: {
      main: "#ff4646",
    },

    text: {
      primary: "#1f2937",
      secondary: "#6b7280",
    },

    divider: "#e5e7eb",
  },

  shape: {
    borderRadius: 16,
  },

  typography: {
    fontFamily: ["Inter", "Roboto", "Arial", "sans-serif"].join(","),

    h4: {
      fontWeight: 800,
      letterSpacing: "-0.3px",
    },

    h5: {
      fontWeight: 700,
    },

    h6: {
      fontWeight: 700,
    },

    subtitle1: {
      fontWeight: 600,
    },

    button: {
      textTransform: "none",
      fontWeight: 700,
      letterSpacing: "0.2px",
    },
  },

  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid #eef0f3",
          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: "10px 18px",
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
        },
      },
    },

    MuiContainer: {
      styleOverrides: {
        root: {
          paddingTop: "8px",
          paddingBottom: "8px",
        },
      },
    },
  },
});

export default theme;