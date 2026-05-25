import { useState, useEffect } from 'react'
import BackgroundMain from './templateComponents/BackgroundMain'
import Sidebar from './templateComponents/Sidebar'
import Header from './templateComponents/Header'
import './templateComponents/templateComponents.css'

const PATH_TO_KEY = {
  '/dashboard': 'dashboard',
  '/user-active': 'user-active',
  '/live-bandwidth': 'live-bandwidth',
  '/mikrotik': 'mikrotik',
}

const KEY_TO_TITLE = {
  dashboard: 'Dashboard',
  'user-active': 'User Active',
  'live-bandwidth': 'Live Bandwidth',
  mikrotik: 'Mikrotik',
}

const defaultPath = '/dashboard'

function getCurrentPath() {
  const path = window.location.pathname
  return PATH_TO_KEY[path] ? path : defaultPath
}

export default function Layout({ children, currentMenu, onMenuChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activePath, setActivePath] = useState(getCurrentPath)

  useEffect(() => {
    const key = PATH_TO_KEY[getCurrentPath()] ?? 'dashboard'
    onMenuChange?.(key)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const path = getCurrentPath()
      setActivePath(path)
      onMenuChange?.(PATH_TO_KEY[path] ?? 'dashboard')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onMenuChange])

  const title = KEY_TO_TITLE[currentMenu] ?? 'Dashboard'

  return (
    <div className={`dashboard-shell${collapsed ? ' dashboard-shell--sidebar-collapsed' : ''}`}>
      <BackgroundMain position="absolute" zIndex={0} />
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        activePath={activePath}
        onToggleCollapse={() => setCollapsed((p) => !p)}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="dashboard-stage">
        <Header
          title={title}
          breadcrumb={[{ label: title, active: true }]}
          showMenuButton
          onMenuToggle={() => setMobileOpen((p) => !p)}
          onRefresh={() => window.location.reload()}
        />
        <main className="dashboard-main">
          {children}
        </main>
      </div>
    </div>
  )
}
