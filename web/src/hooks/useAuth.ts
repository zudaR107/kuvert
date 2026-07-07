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
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
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

  async function login(email: string, password: string) {
    const res = await schluesselFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error('Login failed')
    const data = await res.json() as { accessToken: string }
    setAccessToken(data.accessToken)
    const me = await schluesselFetch('/me', {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    })
    setUser(await me.json() as AuthUser)
  }

  async function logout() {
    await schluesselFetch('/logout', { method: 'POST' })
    setAccessToken(null)
    setUser(null)
  }

  return { user, loading, login, logout }
}
