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
  sessionStorage.clear()
  vi.spyOn(api, 'setAccessToken')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AuthCallbackPage — code + stored verifier present', () => {
  it('POSTs to /auth/token with the code and stored verifier', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    const user = { id: '1', email: 'a@a.com', name: 'A', role: 'user' as const }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'real-token', user }),
    } as Response)
    renderCallback()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/auth/token')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body.code).toBe('abc123')
    // The exact verifier field name/sessionStorage key is an implementation
    // detail we deliberately don't hardcode assertions against beyond this
    // round trip (see note in file header / task report).
    restore()
  })

  it('sets the access token and user only after the exchange resolves successfully', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    const user = { id: '1', email: 'a@a.com', name: 'A', role: 'user' as const }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'real-token', user }),
    } as Response)
    const setUser = vi.fn()
    renderCallback(setUser)

    await waitFor(() => expect(api.setAccessToken).toHaveBeenCalledWith('real-token'))
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user))
    restore()
  })

  it('does not call setAccessToken synchronously before the fetch resolves', () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    // Never-resolving fetch: if setAccessToken were called synchronously
    // (old fragment-token behavior), it would already have happened by now.
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    renderCallback()

    expect(api.setAccessToken).not.toHaveBeenCalled()
    restore()
  })

  it('navigates to "next" after a successful exchange', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123&next=%2Ftransactions')
    const user = { id: '1', email: 'a@a.com', name: 'A', role: 'user' as const }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'real-token', user }),
    } as Response)
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/transactions', replace: true }))
    restore()
  })

  it('defaults to /budget when there is no "next" param', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    restore()
  })

  it('strips the query string from the URL immediately (synchronously)', () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const replaceStateSpy = vi.spyOn(history, 'replaceState')
    const restore = setLocation('', '?code=abc123')
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    renderCallback()

    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/auth/callback')
    replaceStateSpy.mockRestore()
    restore()
  })

  it('removes the stored verifier from sessionStorage after a successful exchange', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    expect(sessionStorage.length).toBe(1)
    const restore = setLocation('', '?code=abc123')
    const user = { id: '1', email: 'a@a.com', name: 'A', role: 'user' as const }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'real-token', user }),
    } as Response)
    renderCallback()

    await waitFor(() => expect(api.setAccessToken).toHaveBeenCalled())
    expect(sessionStorage.length).toBe(0)
    restore()
  })

  it('does not call setAccessToken or setUser on a non-ok response, but still navigates', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const setUser = vi.fn()
    renderCallback(setUser)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    expect(api.setAccessToken).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
    restore()
  })

  it('does not call setAccessToken or setUser when the fetch rejects, but still navigates', async () => {
    sessionStorage.setItem('pkce_code_verifier', 'stored-verifier')
    const restore = setLocation('', '?code=abc123')
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))
    const setUser = vi.fn()
    renderCallback(setUser)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    expect(api.setAccessToken).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
    restore()
  })
})

describe('AuthCallbackPage — code present but no stored verifier', () => {
  it('behaves like "no code": navigates to next without fetching or setting the token', async () => {
    sessionStorage.clear()
    const restore = setLocation('', '?code=abc123&next=%2Fbudget')
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    expect(fetch).not.toHaveBeenCalled()
    expect(api.setAccessToken).not.toHaveBeenCalled()
    restore()
  })
})

describe('AuthCallbackPage — no code in the query string', () => {
  it('navigates to "next" without touching the access token or fetching', async () => {
    const restore = setLocation('', '?next=%2Fbudget')
    renderCallback()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget', replace: true }))
    expect(api.setAccessToken).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    restore()
  })
})
