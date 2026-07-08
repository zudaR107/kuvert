import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  LayoutDashboard, Receipt, Target, CreditCard, Wallet,
  LogOut, Sun, Moon, Monitor, Coffee, Menu, X, ChevronLeft
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { type Theme, THEMES, getStoredTheme, applyTheme } from '../lib/theme'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'

const NAV_ITEMS = [
  { to: '/budget',       icon: <LayoutDashboard size={18} />, label: 'Бюджет' },
  { to: '/transactions', icon: <Receipt size={18} />,         label: 'Транзакции' },
  { to: '/goals',        icon: <Target size={18} />,          label: 'Цели' },
  { to: '/debts',        icon: <CreditCard size={18} />,      label: 'Долги' },
  { to: '/accounts',     icon: <Wallet size={18} />,          label: 'Счета' },
]

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun size={15} />,
  dark:  <Moon size={15} />,
  oled:  <Monitor size={15} />,
  sepia: <Coffee size={15} />,
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [collapsed, setCollapsed] = useState(false)

  function cycleTheme() {
    const idx = THEMES.indexOf(theme)
    const next = THEMES[(idx + 1) % THEMES.length] as Theme
    setTheme(next)
    applyTheme(next)
  }

  const sidebarWidth = collapsed ? 64 : 220

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 40 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: sidebarWidth,
          background: 'var(--sidebar-bg)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: 'width 200ms ease',
          position: 'relative',
          zIndex: 50,
        }}
        className="hidden-mobile"
      >
        {/* Logo */}
        <div style={{
          height: 56, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 0 0 18px' : '0 1rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: '0.625rem',
          overflow: 'hidden',
        }}>
          <div style={{
            width: 28, height: 28, background: 'var(--sidebar-accent)',
            borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <rect x="2" y="5" width="20" height="15" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </div>
          {!collapsed && (
            <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              Kuvert
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  transition: 'background 150ms, color 150ms',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ flexShrink: 0 }}>{icon}</span>
                {!collapsed && label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={cycleTheme}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--sidebar-text)',
              fontSize: '0.8125rem', transition: 'background 150ms',
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%',
            }}
          >
            {THEME_ICONS[theme]}
            {!collapsed && <span>Тема: {theme}</span>}
          </button>
          {user && (
            <button
              onClick={async () => { await logout(); window.location.href = buildSchluesselLoginUrl(pathname) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--sidebar-text)',
                fontSize: '0.8125rem', transition: 'background 150ms',
                justifyContent: collapsed ? 'center' : 'flex-start',
                width: '100%',
              }}
            >
              <LogOut size={15} />
              {!collapsed && 'Выйти'}
            </button>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            position: 'absolute', right: -12, top: 70,
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)', zIndex: 60,
            transition: 'transform 200ms',
            transform: collapsed ? 'rotate(180deg)' : 'none',
          }}
        >
          <ChevronLeft size={12} color="var(--text-muted)" />
        </button>
      </aside>

      {/* Mobile sidebar */}
      <aside
        style={{
          position: 'fixed', left: mobileOpen ? 0 : -260, top: 0, bottom: 0,
          width: 260, background: 'var(--sidebar-bg)',
          zIndex: 50, transition: 'left 250ms ease',
          display: 'flex', flexDirection: 'column',
        }}
        className="show-mobile"
      >
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9375rem' }}>Kuvert</span>
          <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--sidebar-text)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <nav style={{ flex: 1, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(({ to, icon, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.625rem',
                  padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none',
                  color: active ? 'white' : 'var(--sidebar-text)',
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  fontSize: '0.875rem', fontWeight: active ? 600 : 400,
                }}
              >
                {icon}{label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile header */}
        <header
          style={{
            height: 52, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.75rem',
            boxShadow: 'var(--shadow-sm)',
          }}
          className="show-mobile"
        >
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Kuvert</span>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
