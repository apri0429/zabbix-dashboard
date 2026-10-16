import {
  Activity,
  BarChartSquare02,
  CpuChip01,
  Globe01,
  LineChartUp01,
  LogOut01,
  Users01,
} from '@untitledui/icons'

export const defaultNavigationPath = '/dashboard'
export const implementedNavigationPaths = [
  '/dashboard',
  '/laporan',
  '/catatan',
  '/user-active',
  '/live-bandwidth',
  '/mikrotik',
]

export const primaryNavigationItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: BarChartSquare02,
  },
  {
    label: 'Traffic Report',
    href: '/laporan',
    icon: LineChartUp01,
  },
  {
    label: 'Network Log',
    href: '/catatan',
    icon: Globe01,
  },
  {
    label: 'Active Users',
    href: '/user-active',
    icon: Users01,
  },
  {
    label: 'Live Bandwidth',
    href: '/live-bandwidth',
    icon: Activity,
  },
  {
    label: 'MikroTik',
    href: '/mikrotik',
    icon: CpuChip01,
  },
]

export const secondaryNavigationItems = [
  {
    label: 'Pilargroup',
    href: '/logout',
    icon: LogOut01,
    variant: 'danger',
  },
]
