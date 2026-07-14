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

  // Does NOT call schlussel's /auth/logout here - that request would be
  // proxied through kuvert's own origin, and the session cookie is
  // host-only to schlussel's origin (no Domain attribute, by design), so
  // it would never actually be sent and this call could never clear it.
  // The real logout happens via a same-origin navigation to schlussel's
  // own /logout page instead (see lib/authRedirect.ts) - this just clears
  // kuvert's own local state before that navigation happens.
  async function logout() {
    setAccessToken(null)
    setUser(null)
  }

  return { user, loading, logout, setUser }
}
