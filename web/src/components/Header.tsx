import { Menu } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Header as SharedHeader } from '@zudar107/schloss-ui'
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
  const navigate = useNavigate()

  return (
    <SharedHeader
      logo={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
          <rect x="2" y="5" width="20" height="15" rx="2" />
          <path d="M2 10h20" />
        </svg>
      }
      homeHref={SCHLOSS_URL}
      user={user}
      onSettings={() => { void navigate({ to: '/settings' }) }}
      onLogout={onLogout}
      leftSlot={
        <button
          onClick={onOpenMobileMenu}
          className="show-mobile"
          aria-label="Меню"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}
        >
          <Menu size={20} />
        </button>
      }
    />
  )
}
