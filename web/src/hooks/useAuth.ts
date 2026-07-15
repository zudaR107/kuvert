import { useState, useEffect, createContext, useContext } from 'react'
import { setAccessToken } from '../lib/api'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  logout: () => Promise<void>
  // Set directly by AuthCallbackPage once it resolves /auth/me for the
  // token it just received from schlussel — the on-mount silent-refresh
  // effect below only runs once, so it can't pick this up on its own.
  setUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  logout: async () => {},
  setUser: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// /auth/* proxy → schlussel:4000/auth/* (vite dev) or nginx upstream (prod)
// path arg should NOT include /auth prefix (e.g. '/login', '/me', '/refresh')
async function schluesselFetch(path: string, init?: RequestInit) {
  return fetch(`/auth${path}`, { ...init, credentials: 'include' })
}

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    schluesselFetch('/refresh', { method: 'POST' })
      .then((r) => r.ok ? r.json() : null)
      .then(async (data: { accessToken: string } | null) => {
        if (!data?.accessToken) return null
        setAccessToken(data.accessToken)
        const me = await schluesselFetch('/me', {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        })
        return me.ok ? (me.json() as Promise<AuthUser>) : null
      })
      .then((u) => setUser(u ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Also clears kuvert's OWN session cookie: every proxied /auth/token or
  // /auth/refresh call kuvert makes gets a Set-Cookie response that the
  // browser scopes to kuvert.localhost (no Domain attribute, by design) -
  // a second, fully independent cookie schlussel's own same-origin
  // /logout page (see lib/authRedirect.ts, navigated to right after this)
  // can never see or clear. This proxied /auth/logout call clears that
  // one immediately instead of leaving it to expire on its own.
  async function logout() {
    await schluesselFetch('/logout', { method: 'POST' }).catch(() => {})
    setAccessToken(null)
    setUser(null)
  }

  return { user, loading, logout, setUser }
}
