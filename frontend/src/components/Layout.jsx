import { useState, useEffect } from 'react'
import { Menu01, Users01, LogOut01, ArrowUp } from '@untitledui/icons'
import './templateComponents/templateComponents.css'
import './netsuite.css'
import logo from './templateComponents/assets/logo-piagam.png'
import { primaryNavigationItems } from './templateComponents/navigation.js'
import { submitLogout } from './templateComponents/logoutService.js'

const PATH_TO_KEY = {
  '/dashboard': 'dashboard',
  '/laporan': 'laporan',
  '/catatan': 'catatan',
  '/user-active': 'user-active',
  '/live-bandwidth': 'live-bandwidth',
  '/mikrotik': 'mikrotik',
}

const defaultPath = '/dashboard'

// Alamat lama yang sudah digabung ke halaman lain (mis. tautan /noc di email laporan).
const REDIRECTS = { '/noc': '/dashboard', '/tanya': '/dashboard' }

function getCurrentPath() {
  if (REDIRECTS[window.location.pathname]) {
    window.history.replaceState({}, '', REDIRECTS[window.location.pathname])
  }
  const path = window.location.pathname
  return PATH_TO_KEY[path] ? path : defaultPath
}

// Kerangka gaya NetSuite: bar putih berisi logo & pengguna, lalu bar menu
// horizontal biru tua. Di HP menu dilipat jadi daftar yang bisa dibuka.
export default function Layout({ children, onMenuChange }) {
  const [activePath, setActivePath] = useState(getCurrentPath)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 200)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!userOpen) return
    const close = (event) => {
      if (!event.target.closest?.('.ns-user')) setUserOpen(false)
    }
    const onKey = (event) => event.key === 'Escape' && setUserOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [userOpen])

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

  const go = (event, href) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    setMenuOpen(false)
    if (window.location.pathname !== href) {
      window.history.pushState({}, '', href)
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.scrollTo({ top: 0 })
    }
  }

  const activeLabel = primaryNavigationItems.find((item) => item.href === activePath)?.label ?? 'Menu'

  return (
    <div className="ns-shell">
      <div className="ns-header">
      <header className="ns-top">
        <div className="ns-brand">
          <img src={logo} alt="Logo Piagam" />
          <span className="ns-brand__name">NetroWatch</span>
        </div>
        <div className="ns-user" onMouseEnter={() => setUserOpen(true)} onMouseLeave={() => setUserOpen(false)}>
          <button
            type="button"
            className="ns-usertrigger"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            onClick={() => setUserOpen((open) => !open)}
          >
            <Users01 size={20} />
            <span className="ns-usertrigger__text">
              <span className="ns-usertrigger__name">IT Team</span>
              <span className="ns-usertrigger__role">NOC Dashboard</span>
            </span>
          </button>
          {userOpen && (
            <div className="ns-usermenu" role="menu">
              <div className="ns-usermenu__who"><b>IT Team</b><span>NOC Dashboard</span></div>
              <button type="button" role="menuitem" className="ns-usermenu__item" onClick={() => submitLogout()}>
                <LogOut01 size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className={`ns-nav${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
        <button
          type="button"
          className="ns-nav__item ns-nav__toggle"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>{activeLabel}</span>
          <Menu01 size={18} />
        </button>
        {primaryNavigationItems.map((item) => {
          const Icon = item.icon
          return (
            <a
              key={item.href}
              href={item.href}
              className={`ns-nav__item${item.href === activePath ? ' active' : ''}`}
              aria-current={item.href === activePath ? 'page' : undefined}
              onClick={(event) => go(event, item.href)}
            >
              {Icon ? <Icon size={16} /> : null}
              {item.label}
            </a>
          )
        })}
      </nav>
      </div>

      <main className="ns-main">{children}</main>
      <footer className="ns-footer">
        <span>© {new Date().getFullYear()} PT Pilar Niaga Makmur</span>
        <span>NetroWatch · Network Monitoring · Dikelola oleh Tim IT</span>
      </footer>
      {showTop && (
        <button
          type="button"
          className="ns-totop"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  )
}
