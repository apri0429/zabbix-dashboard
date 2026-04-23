import {
  Box,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CheckCircleRoundedIcon      from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon     from "@mui/icons-material/WarningAmberRounded";
import ErrorRoundedIcon            from "@mui/icons-material/ErrorRounded";
import AssessmentOutlinedIcon      from "@mui/icons-material/AssessmentOutlined";
import BoltRoundedIcon             from "@mui/icons-material/BoltRounded";
import TimelineRoundedIcon         from "@mui/icons-material/TimelineRounded";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_META = {
  STABIL: { color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0", Icon: CheckCircleRoundedIcon },
  PADAT:  { color: "#d97706", bg: "#fef3c7", border: "#fde68a", Icon: WarningAmberRoundedIcon },
  TINGGI: { color: "#dc2626", bg: "#fee2e2", border: "#fecaca", Icon: ErrorRoundedIcon },
};

// ─── Table Header Cell ────────────────────────────────────────────────────────
const TH = ({ children, align = "left" }) => (
  <TableCell
    align={align}
    sx={{
      color: "#64748b",
      fontWeight: 700,
      fontSize: "0.65rem",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      borderBottom: "0.5px solid rgba(0,0,0,0.08)",
      bgcolor: "#f8fafc",
      py: 1.75,
      px: 2,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </TableCell>
);

// ─── Table Data Cell ──────────────────────────────────────────────────────────
const TD = ({ children, align = "left", sx = {} }) => (
  <TableCell
    align={align}
    sx={{
      borderBottom: "0.5px solid rgba(0,0,0,0.05)",
      py: 1.75,
      px: 2,
      fontSize: "0.82rem",
      ...sx,
    }}
  >
    {children}
  </TableCell>
);

// ─── Mbps Cell ────────────────────────────────────────────────────────────────
function MbpsCell({ mbps, pct, color = "#1a56db" }) {
  return (
    <Stack spacing={0.5} alignItems="center">
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: "0.82rem",
          color: "#0f172a",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {mbps ?? "-"}{" "}
        <Box component="span" sx={{ color: "#94a3b8", fontSize: "0.68rem", fontWeight: 400 }}>
          Mbps
        </Box>
      </Typography>

      {pct !== undefined && (
        <>
          <Typography sx={{ fontSize: "0.68rem", color, fontWeight: 700, lineHeight: 1 }}>
            {pct}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(pct, 100)}
            sx={{
              width: 56, height: 3,
              bgcolor: "rgba(0,0,0,0.06)",
              borderRadius: 999,
              "& .MuiLinearProgress-bar": {
                background: color,
                borderRadius: 999,
              },
            }}
          />
        </>
      )}
    </Stack>
  );
}

// ─── Score Cell ───────────────────────────────────────────────────────────────
function ScoreCell({ score, color }) {
  if (score === undefined || score === null) {
    return <Typography sx={{ color: "#94a3b8", fontSize: "0.82rem" }}>-</Typography>;
  }
  return (
    <Stack alignItems="center" spacing={0.6}>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize: "0.9rem",
          color,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}%
      </Typography>
      <LinearProgress
        variant="determinate"
        value={Math.min(score, 100)}
        sx={{
          width: 52, height: 4,
          bgcolor: "rgba(0,0,0,0.06)",
          borderRadius: 999,
          "& .MuiLinearProgress-bar": {
            background: color,
            borderRadius: 999,
          },
        }}
      />
    </Stack>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <TableRow>
      <TableCell colSpan={9} align="center" sx={{ border: "none", py: 6 }}>
        <Stack alignItems="center" spacing={2}>
          {/* Layered icon illustration */}
          <Box sx={{ position: "relative", width: 96, height: 96 }}>
            {/* Outer glow ring */}
            <Box sx={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(26,86,219,0.10) 0%, transparent 70%)",
            }} />
            {/* Dashed orbit ring */}
            <Box sx={{
              position: "absolute", inset: 4,
              borderRadius: "50%",
              border: "1.5px dashed rgba(26,86,219,0.18)",
            }} />
            {/* Main icon box */}
            <Box sx={{
              position: "absolute", inset: 16,
              borderRadius: "18px",
              background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
              border: "1px solid rgba(26,86,219,0.14)",
              boxShadow: "0 4px 16px rgba(26,86,219,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AssessmentOutlinedIcon sx={{ fontSize: 30, color: "#93c5fd" }} />
            </Box>
            {/* Small bolt badge top-right */}
            <Box sx={{
              position: "absolute", top: 6, right: 6,
              width: 20, height: 20, borderRadius: "50%",
              background: "#dbeafe",
              border: "1.5px solid #ffffff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <BoltRoundedIcon sx={{ fontSize: 12, color: "#3b82f6" }} />
            </Box>
            {/* Small chart badge bottom-left */}
            <Box sx={{
              position: "absolute", bottom: 6, left: 6,
              width: 20, height: 20, borderRadius: "50%",
              background: "#ede9fe",
              border: "1.5px solid #ffffff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <TimelineRoundedIcon sx={{ fontSize: 12, color: "#7c3aed" }} />
            </Box>
          </Box>

          {/* Text */}
          <Box textAlign="center">
            <Typography sx={{ fontSize: "0.9rem", color: "#334155", fontWeight: 700, mb: 0.5 }}>
              Belum ada data trafik
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.6, maxWidth: 260, mx: "auto" }}>
              Pilih rentang tanggal lalu klik{" "}
              <Box component="span" sx={{ color: "#1a56db", fontWeight: 600 }}>Generate Report</Box>
              {" "}untuk melihat data trafik jaringan
            </Typography>
          </Box>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportTable({ rows = [] }) {
  return (
    <TableContainer
      sx={{
        borderRadius: 2.5,
        border: "0.5px solid rgba(0,0,0,0.07)",
        background: "#ffffff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        "&::-webkit-scrollbar":       { height: 5 },
        "&::-webkit-scrollbar-track": { background: "#f1f5f9" },
        "&::-webkit-scrollbar-thumb": { background: "#cbd5e1", borderRadius: 99 },
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TH>#</TH>
            <TH>Host / ISP</TH>
            <TH align="center">Kapasitas</TH>
            <TH align="center">Avg Down</TH>
            <TH align="center">Avg Up</TH>
            <TH align="center">Peak Down</TH>
            <TH align="center">Peak Up</TH>
            <TH align="center">Score</TH>
            <TH align="center">Status</TH>
          </TableRow>
        </TableHead>

        <TableBody>
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((row, i) => {
              const meta  = STATUS_META[row.status] || STATUS_META.STABIL;
              const isOdd = i % 2 !== 0;

              return (
                <TableRow
                  key={row.label ?? i}
                  sx={{
                    bgcolor: isOdd ? "#f8fafc" : "#ffffff",
                    transition: "background 0.15s",
                    "&:hover": {
                      bgcolor: "#eff6ff",
                      "& .row-index": { color: "#1a56db" },
                    },
                    "&:last-child td": { borderBottom: "none" },
                  }}
                >
                  {/* # */}
                  <TD sx={{ width: 40 }}>
                    <Typography
                      className="row-index"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.76rem",
                        color: "#94a3b8",
                        transition: "color 0.15s",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </Typography>
                  </TD>

                  {/* Host */}
                  <TD sx={{ maxWidth: 220 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                          bgcolor: meta.color,
                        }}
                      />
                      <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.84rem", color: "#0f172a" }}>
                        {row.label}
                      </Typography>
                    </Stack>
                  </TD>

                  {/* Kapasitas */}
                  <TD align="center">
                    <Typography sx={{ fontWeight: 600, fontSize: "0.82rem", color: "#334155", fontVariantNumeric: "tabular-nums" }}>
                      {row.capacity ?? "-"}{" "}
                      <Box component="span" sx={{ fontSize: "0.68rem", color: "#94a3b8" }}>Mbps</Box>
                    </Typography>
                  </TD>

                  {/* Avg Down */}
                  <TD align="center">
                    <MbpsCell mbps={row.avg_download} pct={row.pct_avg_download} color="#1a56db" />
                  </TD>

                  {/* Avg Up */}
                  <TD align="center">
                    <MbpsCell mbps={row.avg_upload} pct={row.pct_avg_upload} color="#7c3aed" />
                  </TD>

                  {/* Peak Down */}
                  <TD align="center">
                    <MbpsCell mbps={row.peak_download} pct={row.pct_peak_download} color="#d97706" />
                  </TD>

                  {/* Peak Up */}
                  <TD align="center">
                    <MbpsCell mbps={row.peak_upload} pct={row.pct_peak_upload} color="#ea580c" />
                  </TD>

                  {/* Score */}
                  <TD align="center" sx={{ minWidth: 90 }}>
                    <ScoreCell score={row.weighted_score} color={meta.color} />
                  </TD>

                  {/* Status */}
                  <TD align="center">
                    <Chip
                      size="small"
                      icon={<meta.Icon style={{ fontSize: 10, color: meta.color }} />}
                      label={row.status ?? "-"}
                      sx={{
                        bgcolor: meta.bg,
                        color: meta.color,
                        border: `1px solid ${meta.border}`,
                        fontWeight: 700,
                        fontSize: "0.65rem",
                        letterSpacing: "0.04em",
                        height: 22,
                        "& .MuiChip-icon": { ml: 0.5 },
                      }}
                    />
                  </TD>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}