import { Chip } from '@mui/material'

export default function StatusChip({ status }) {
  const colorMap = {
    STABIL: 'success',
    PADAT: 'warning',
    TINGGI: 'error',
  }

  return <Chip label={status} color={colorMap[status] || 'default'} />
}