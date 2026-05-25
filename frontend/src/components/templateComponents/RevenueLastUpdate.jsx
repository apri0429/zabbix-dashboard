import { Box, Typography } from '@mui/material'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'

function formatLastUpdate(value = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function RevenueLastUpdate({ sx }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.75,
        borderRadius: 999,
        bgcolor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        color: '#475569',
        ...sx,
      }}
    >
      <AccessTimeRoundedIcon sx={{ fontSize: '0.95rem', color: '#64748B' }} />
      <Typography
        sx={{
          fontSize: '0.75rem',
          fontWeight: 500,
          lineHeight: 1.2,
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        Update terakhir: {formatLastUpdate()}
      </Typography>
    </Box>
  )
}

export default RevenueLastUpdate
