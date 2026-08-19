import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  LayoutDashboard, Mail, Receipt, Target, CreditCard, Wallet, Settings,
  FileCode2, HelpCircle
} from 'lucide-react'
import { Toast, Sidebar, type SidebarLinkRenderProps } from '@zudar107/schloss-ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { buildSchluesselLogoutUrl, buildSchluesselAccountUrl } from '../lib/authRedirect'
import { Footer } from './Footer'
import { Header } from './Header'

const SIDEBAR_WIDTH_STORAGE_KEY = 'kuvert-sidebar-width'

const NAV_ITEMS = [
  { to: '/budget',       icon: <LayoutDashboard size={18} />, label: 'Бюджет' },
  { to: '/envelopes',    icon: <Mail size={18} />,            label: 'Конверты' },
  { to: '/transactions', icon: <Receipt size={18} />,         label: 'Транзакции' },
  { to: '/goals',        icon: <Target size={18} />,          label: 'Цели' },
  { to: '/debts',        icon: <CreditCard size={18} />,      label: 'Долги' },
  { to: '/accounts',     icon: <Wallet size={18} />,          label: 'Счета' },
  { to: '/settings',     icon: <Settings size={18} />,        label: 'Настройки' },
  { to: '/help',         icon: <HelpCircle size={18} />,      label: 'Справка' },
]

// Admin-only, appended rather than baked into NAV_ITEMS - /docs 403s the
// API request for anyone else, so hiding the link avoids a dead-end click.
const DOCS_NAV_ITEM = { to: '/docs', icon: <FileCode2 size={18} />, label: 'Документация API' }

const BRAND_MARK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="5" width="20" height="14" rx="2" fill="white" />
    <path d="M2 6 L22 6 L12 15 Z" fill="#0b7d73" />
  </svg>
)

function renderNavLink({ to, icon, label, collapsed, style, onClick, onMouseEnter, onMouseLeave }: SidebarLinkRenderProps) {
  return (
    <Link key={to} to={to} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && label}
    </Link>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const toast = useToast()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = user?.role === 'admin' ? [...NAV_ITEMS, DOCS_NAV_ITEM] : NAV_ITEMS

  async function handleLogout() {
    try {
      await logout()
      window.location.href = buildSchluesselLogoutUrl()
    } catch (err) {
      // Without this, a failed logout silently did nothing visible - the
      // button looked broken rather than surfacing what went wrong.
      console.error('Logout failed', err)
      toast.showError('Не удалось выйти. Попробуйте ещё раз.')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Sidebar
        storageKey={SIDEBAR_WIDTH_STORAGE_KEY}
        ariaLabel="Разделы Kuvert"
        brandName="Kuvert"
        brandMark={BRAND_MARK}
        navItems={navItems}
        activePath={pathname}
        renderLink={renderNavLink}
        user={user ? { name: user.name, email: user.email } : null}
        onAccountClick={() => { window.location.href = buildSchluesselAccountUrl(window.location.pathname) }}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

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

      {toast.toast && (
        <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
      )}
    </div>
  )
}
