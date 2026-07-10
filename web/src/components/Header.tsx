import { Link } from '@tanstack/react-router'
import { Home, Settings, LogOut, Menu } from 'lucide-react'
import type { AuthUser } from '../hooks/useAuth'

// Where "На главную" links back to (schloss) - separate from
// VITE_SCHLUSSEL_URL, which points the other way (to the login page).
const SCHLOSS_URL: string = (import.meta.env.VITE_SCHLOSS_URL as string | undefined) ?? 'http://localhost:3000'

interface HeaderProps {
  user: AuthUser | null
  onLogout: () => void
  onOpenMobileMenu: () => void
}

// Always visible (desktop and mobile) - previously the only "header" on
// mobile was bare branding with no way back to schloss or to settings,
// and the sidebar (which does carry identity/settings/logout) is hidden
// entirely below the mobile breakpoint. This sits alongside the sidebar's
// own controls rather than replacing them.
export function Header({ user, onLogout, onOpenMobileMenu }: HeaderProps) {
  return (
    <header style={{
      height: 56, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1.5rem', gap: '0.75rem', boxShadow: 'var(--shadow-sm)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={onOpenMobileMenu}
          className="show-mobile"
          aria-label="Меню"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}
        >
          <Menu size={20} />
        </button>
        <a
          href={SCHLOSS_URL}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', textDecoration: 'none', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}
        >
          <Home size={16} />
          <span className="hidden-mobile" style={{ display: 'flex' }}>На главную</span>
        </a>
      </div>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="hidden-mobile" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {user.name}
          </span>
          <Link
            to="/settings"
            aria-label="Настройки"
            style={{ display: 'flex', color: 'var(--text-secondary)' }}
          >
            <Settings size={18} />
          </Link>
          <button
            onClick={onLogout}
            aria-label="Выйти"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  )
}
