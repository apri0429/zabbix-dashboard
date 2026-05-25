import {
  Activity,
  BarChartSquare02,
  CpuChip01,
  LogOut01,
  Users01,
} from '@untitledui/icons'

export const defaultNavigationPath = '/dashboard'
export const implementedNavigationPaths = [
  '/dashboard',
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
    label: 'User Active',
    href: '/user-active',
    icon: Users01,
  },
  {
    label: 'Live Bandwidth',
    href: '/live-bandwidth',
    icon: Activity,
  },
  {
    label: 'Mikrotik',
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
