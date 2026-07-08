import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage'
import { AuthContext } from '../hooks/useAuth'
import * as api from '../lib/api'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

function setLocation(hash: string, search: string) {
  const original = window.location
  // @ts-expect-error -- jsdom allows reassigning location for test purposes
  delete window.location
  // @ts-expect-error -- minimal stub covering what the component under test reads
  window.location = { ...original, hash, search, pathname: '/auth/callback' }
  return () => {
    // @ts-expect-error -- restoring jsdom's original Location object
    window.location = original
  }
}

function renderCallback(setUser = vi.fn()) {
  return render(
    <AuthContext.Provider value={{ user: null, loading: false, logout: vi.fn(), setUser }}>
      <AuthCallbackPage />
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
  vi.spyOn(api, 'setAccessToken')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AuthCallbackPage — token present', () => {
  it('sets the access token from the hash', async () => {
    const restore = setLocation('#token=abc123', '')
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    renderCallback()

    await waitFor(() => expect(api.setAccessToken).toHaveBeenCalledWith('abc123'))
    restore()
  })

  it('strips the hash from the URL immediately', async () => {
    const replaceStateSpy = vi.spyOn(history, 'replaceState')
    const restore = setLocation('#token=abc123', '')
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    renderCallback()

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/auth/callback')
    replaceStateSpy.mockRestore()
    restore()
  })

  it('navigates to the "next" param on success, replacing history', async () => {
    const restore = setLocation('#token=abc123', '?next=%2Ftransactions')
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', email: 'a@a.com', name: 'A', role: 'user' }),
    } as Response)
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/transactions', replace: true }))
    restore()
  })

  it('defaults to /budget when there is no "next" param', async () => {
    const restore = setLocation('#token=abc123', '')
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    restore()
  })

  it('populates the user in context when /auth/me succeeds', async () => {
    const restore = setLocation('#token=abc123', '')
    const user = { id: '1', email: 'a@a.com', name: 'A', role: 'user' as const }
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => user } as Response)
    const setUser = vi.fn()
    renderCallback(setUser)

    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user))
    restore()
  })

  it('still navigates away even when /auth/me fails', async () => {
    const restore = setLocation('#token=abc123', '')
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    restore()
  })
})

describe('AuthCallbackPage — no token in the hash', () => {
  it('navigates to "next" without touching the access token or fetching /auth/me', async () => {
    const restore = setLocation('', '?next=%2Fbudget')
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    expect(api.setAccessToken).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    restore()
  })
})
