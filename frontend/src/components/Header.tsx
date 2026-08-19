import { useState } from 'react'
import { Menu } from 'lucide-react'
import {
  Header as SharedHeader,
  normalizeNotificationOrigin,
  ThemeToggle,
  useAvatarUrl,
  useUnreadNotifications,
} from '@zudar107/schloss-ui'
import { buildSchluesselAccountUrl } from '../lib/authRedirect'
import type { AuthUser } from '../hooks/useAuth'
import { apiClient } from '../lib/api'

// Where "На главную" links back to (schloss) - separate from
// VITE_SCHLUSSEL_URL, which points the other way (to the login page).
const DEFAULT_SCHLOSS_URL = 'http://localhost:3000'
const DEFAULT_GLOCKE_URL = 'http://localhost:5177'
const DEFAULT_SCHLUSSEL_URL = 'http://localhost:4001'

interface HeaderProps {
  user: AuthUser | null
  onLogout: () => void | Promise<void>
  onOpenMobileMenu: () => void
}

// Always visible (desktop and mobile) - previously the only "header" on
// mobile was bare branding with no way back to schloss or to settings,
// and the sidebar (which does carry identity/settings/logout) is hidden
// entirely below the mobile breakpoint. This sits alongside the sidebar's
// own controls rather than replacing them.
export function Header({ user, onLogout, onOpenMobileMenu }: HeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const schlossUrl = (import.meta.env.VITE_SCHLOSS_URL as string | undefined) ?? DEFAULT_SCHLOSS_URL
  const glockeUrl = (import.meta.env.VITE_GLOCKE_URL as string | undefined) ?? DEFAULT_GLOCKE_URL
  const schluesselUrl = (import.meta.env.VITE_SCHLUSSEL_URL as string | undefined) ?? DEFAULT_SCHLUSSEL_URL
  const notificationOrigin = normalizeNotificationOrigin(glockeUrl)
  const notificationState = useUnreadNotifications({
    glockeOrigin: glockeUrl,
    userId: loggingOut ? null : user?.id ?? null,
    apiClient,
  })
  const avatarUrl = useAvatarUrl({
    schluesselOrigin: schluesselUrl,
    userId: loggingOut ? null : user?.id ?? null,
    apiClient,
  })

  function handleLogout() {
    setLoggingOut(true)
    void Promise.resolve(onLogout()).catch(() => setLoggingOut(false))
  }

  return (
    <SharedHeader
      // The home link leads to schloss (kuvert has no home page of its
      // own), so the badge shows schloss's own logo mark, not kuvert's -
      // it should look like it goes to a different app, not display
      // kuvert's identity in a slot meant for "where this link goes".
      logo={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      }
      homeHref={schlossUrl}
      homeTitle="На главную"
      user={user ? { ...user, avatarUrl } : null}
      // The header's gear icon opens the platform-wide account settings
      // hosted on schlussel (password, delete account, ...) - NOT
      // kuvert's own /settings route, which is service-specific
      // preferences (currency) and stays reachable from the sidebar.
      onSettings={() => { window.location.href = buildSchluesselAccountUrl(window.location.pathname) }}
      onLogout={handleLogout}
      notifications={user && !loggingOut && notificationOrigin
        ? { href: `${notificationOrigin}/notifications`, state: notificationState, glockeOrigin: notificationOrigin, apiClient }
        : undefined}
      rightSlot={<ThemeToggle />}
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
