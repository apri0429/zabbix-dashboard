import { Box, Paper, Stack, Typography } from "@mui/material";

export default function SummaryCard({ title, value, subtitle, color = "#1a56db", icon: Icon }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        border: "0.5px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        transition: "transform 0.22s cubic-bezier(.22,.68,0,1.2), box-shadow 0.22s",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: `0 12px 32px ${color}18, 0 0 0 1px ${color}18`,
        },
        // Colored top bar
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "3px",
          background: color,
          borderRadius: "12px 12px 0 0",
          pointerEvents: "none",
        },
        // Subtle tinted background wash bottom-right
        "&::after": {
          content: '""',
          position: "absolute",
          bottom: -24, right: -24,
          width: 120, height: 120,
          borderRadius: "50%",
          background: `${color}0c`,
          pointerEvents: "none",
        },
      }}
    >
      <Stack spacing={2} height="100%">
        {Icon && (
          <Box
            sx={{
              position: "absolute",
              right: -10,
              bottom: -6,
              width: 116,
              height: 116,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `radial-gradient(circle, ${color}12 0%, ${color}06 48%, transparent 74%)`,
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            <Icon
              sx={{
                fontSize: 72,
                color: `${color}20`,
                filter: "blur(0.2px)",
              }}
            />
          </Box>
        )}

        {/* Icon + label row */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              width: 44, height: 44,
              borderRadius: 2.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${color}14`,
              border: `1px solid ${color}22`,
              color,
              flexShrink: 0,
            }}
          >
            {Icon && <Icon sx={{ fontSize: 21 }} />}
          </Box>

          {/* Subtle value badge top-right */}
          <Box
            sx={{
              px: 1.25, py: 0.45,
              borderRadius: 99,
              background: `${color}0f`,
              border: `1px solid ${color}1a`,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.62rem",
                fontWeight: 700,
                color,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                lineHeight: 1.4,
              }}
            >
              Live
            </Typography>
          </Box>
        </Stack>

        {/* Main value */}
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography
            sx={{
              fontSize: "2.5rem",
              fontWeight: 700,
              lineHeight: 1,
              color,
              mb: 0.5,
              letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </Typography>

          <Typography
            sx={{
              fontSize: "0.84rem",
              color: "#0f172a",
              fontWeight: 600,
              mb: 0.3,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </Typography>

          <Typography
            sx={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </Typography>
        </Box>

        {/* Bottom accent line */}
        <Box
          sx={{
            mt: "auto",
            position: "relative",
            zIndex: 1,
            height: "2px",
            borderRadius: 99,
            background: `linear-gradient(90deg, ${color}40, ${color}08)`,
          }}
        />
      </Stack>
    </Paper>
  );
}
