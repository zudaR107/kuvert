import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  LayoutDashboard, Receipt, Target, CreditCard, Wallet, Settings,
  LogOut, Sun, Moon, Monitor, Coffee, X
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { type Theme, THEMES, getStoredTheme, applyTheme } from '../lib/theme'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'
import { Footer } from './Footer'
import { Header } from './Header'

const SIDEBAR_COLLAPSED_WIDTH = 64
const SIDEBAR_DEFAULT_WIDTH = 220
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 360
// Dragging narrower than this snaps shut to the icon-only rail instead of
// leaving an awkward in-between width.
const SIDEBAR_COLLAPSE_THRESHOLD = 140
const SIDEBAR_WIDTH_STORAGE_KEY = 'kuvert-sidebar-width'

function getStoredSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
  if (Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH) {
    return stored
  }
  return SIDEBAR_DEFAULT_WIDTH
}

const NAV_ITEMS = [
  { to: '/budget',       icon: <LayoutDashboard size={18} />, label: 'Бюджет' },
  { to: '/transactions', icon: <Receipt size={18} />,         label: 'Транзакции' },
  { to: '/goals',        icon: <Target size={18} />,          label: 'Цели' },
  { to: '/debts',        icon: <CreditCard size={18} />,      label: 'Долги' },
  { to: '/accounts',     icon: <Wallet size={18} />,          label: 'Счета' },
  { to: '/settings',     icon: <Settings size={18} />,        label: 'Настройки' },
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
  const [expandedWidth, setExpandedWidth] = useState(getStoredSidebarWidth)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
  // Browsers fire a synthetic "click" on mouseup right after a drag if the
  // pointer ends up back over an element inside the sidebar (which it
  // often does for a small drag) - without this, that phantom click
  // bubbles to the sidebar's own click-to-toggle handler below and
  // immediately collapses whatever width was just dragged to. Set to
  // true for the rest of this tick whenever a real drag happened; the
  // click-to-toggle handler checks and ignores it.
  const suppressNextClickRef = useRef(false)

  function cycleTheme() {
    const idx = THEMES.indexOf(theme)
    const next = THEMES[(idx + 1) % THEMES.length] as Theme
    setTheme(next)
    applyTheme(next)
  }

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : expandedWidth

  const handlePointerMove = useCallback((e: MouseEvent) => {
    const start = dragStartRef.current
    if (!start) return
    const next = start.startWidth + (e.clientX - start.startX)
    suppressNextClickRef.current = true
    if (next < SIDEBAR_COLLAPSE_THRESHOLD) {
      setCollapsed(true)
    } else {
      setCollapsed(false)
      setExpandedWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)))
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null
    setDragging(false)
    if (suppressNextClickRef.current) {
      // Only suppress the synthetic click browsers fire immediately after
      // this mouseup (same tick) - not some unrelated future click, in
      // case the drag ended with the pointer outside the sidebar and no
      // phantom click ever arrives to consume this flag itself.
      setTimeout(() => { suppressNextClickRef.current = false }, 0)
    }
  }, [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [dragging, handlePointerMove, handlePointerUp])

  useEffect(() => {
    if (!collapsed) localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(expandedWidth))
  }, [collapsed, expandedWidth])

  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragStartRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    setDragging(true)
  }

  async function handleLogout() {
    await logout()
    window.location.href = await buildSchluesselLoginUrl(pathname)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 40 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - clicking anywhere on it that isn't a nav link/button
          (i.e. empty space: the logo area, gaps around the nav list, the
          padding around the bottom actions) toggles collapsed/expanded.
          Each interactive child below stops the click from bubbling here,
          so clicking an actual control never also toggles the sidebar. */}
      <aside
        onClick={() => {
          if (suppressNextClickRef.current) return
          setCollapsed((c) => !c)
        }}
        style={{
          width: sidebarWidth,
          background: 'var(--sidebar-bg)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: dragging ? 'none' : 'width 200ms ease',
          position: 'relative',
          zIndex: 50,
          cursor: 'pointer',
        }}
        className="hidden-mobile"
      >
        {/* Resize handle - drag anywhere along the sidebar's right edge to
            resize continuously; dragging past SIDEBAR_COLLAPSE_THRESHOLD
            snaps shut. Wider than the border itself (10px) so it's easy to
            grab, not just the old 24x24 toggle button below. */}
        <div
          onMouseDown={startDrag}
          style={{
            position: 'absolute', top: 0, bottom: 0, right: -5, width: 10,
            cursor: 'col-resize', zIndex: 61,
          }}
        />
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

        {/* Nav - minHeight: 0 for the same reason as <main> below (a flex
            item won't scroll within its space without it, growing the
            sidebar past the viewport instead once there are enough
            nav items). */}
        <nav style={{ flex: 1, minHeight: 0, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                onClick={(e) => e.stopPropagation()}
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
          {user && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
                marginBottom: 4,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--sidebar-accent)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700,
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', minWidth: 0 }}>
                  <div style={{
                    color: 'var(--sidebar-text-active)', fontSize: '0.8125rem', fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {user.name}
                  </div>
                  <div style={{
                    color: 'var(--sidebar-text)', fontSize: '0.6875rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {user.email}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); cycleTheme() }}
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
              onClick={async (e) => { e.stopPropagation(); await handleLogout() }}
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
        <Header user={user} onLogout={handleLogout} onOpenMobileMenu={() => setMobileOpen(true)} />

        {/* minHeight: 0 is required here - a flex item defaults to
            min-height: auto, which lets it grow to fit tall content
            instead of scrolling within its allotted space. Without it,
            long pages (a big transaction list, a full budget table) push
            past the viewport and the Footer below gets clipped by the
            parent's overflow: hidden - not just "needs scrolling",
            genuinely unreachable. */}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.5rem' }}>
          {children}
        </main>

        <Footer />
      </div>
    </div>
  )
}
