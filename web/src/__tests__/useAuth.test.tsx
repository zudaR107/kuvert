import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAuthProvider } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import * as api from '../lib/api'

// Builds a `global.fetch` mock that routes on the request URL, covering all
// three endpoints the hook can call: the on-mount `/auth/refresh` (and its
// conditional follow-up `/auth/me`), plus `/auth/logout`. Callers only need
// to override the endpoints relevant to their scenario; everything else
// defaults to a harmless non-ok response so the mount effect settles quickly
// into "not logged in" without triggering extra calls.
function mockFetch(overrides: {
  refresh?: () => Promise<Response>
  me?: () => Promise<Response>
  logout?: () => Promise<Response>
} = {}) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/refresh')) {
      return overrides.refresh ? overrides.refresh() : Promise.resolve({ ok: false } as Response)
    }
    if (url.includes('/auth/me')) {
      return overrides.me ? overrides.me() : Promise.resolve({ ok: false } as Response)
    }
    if (url.includes('/auth/logout')) {
      return overrides.logout ? overrides.logout() : Promise.resolve({ ok: true } as Response)
    }
    return Promise.resolve({ ok: false } as Response)
  })
}

const mockUser: AuthUser = { id: '1', email: 'a@a.com', name: 'A', role: 'user' }

// Mocks that make the on-mount effect resolve to "logged in as mockUser",
// so logout()'s state-clearing effect has something to actually clear.
function loggedInMountMocks() {
  return {
    refresh: () => Promise.resolve({ ok: true, json: async () => ({ accessToken: 'tok' }) } as Response),
    me: () => Promise.resolve({ ok: true, json: async () => mockUser } as Response),
  }
}

beforeEach(() => {
  vi.spyOn(api, 'setAccessToken')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAuthProvider — logout', () => {
  it('POSTs to /auth/logout with credentials included', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthProvider())
    await waitFor(() => expect(result.current.loading).toBe(false))
    fetchMock.mockClear()

    await act(async () => {
      await result.current.logout()
    })

    const logoutCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : input.toString()).includes('/auth/logout'),
    )
    expect(logoutCall).toBeDefined()
    const [url, init] = logoutCall as [string, RequestInit]
    expect(url).toBe('/auth/logout')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
  })

  it('clears the local user state after logout resolves', async () => {
    const fetchMock = mockFetch(loggedInMountMocks())
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthProvider())
    await waitFor(() => expect(result.current.user).toEqual(mockUser))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(api.setAccessToken).toHaveBeenCalledWith(null)
  })

  it('still resolves and clears state when the /auth/logout fetch rejects with a network error', async () => {
    const fetchMock = mockFetch({
      ...loggedInMountMocks(),
      logout: () => Promise.reject(new Error('network error')),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthProvider())
    await waitFor(() => expect(result.current.user).toEqual(mockUser))

    // Plain `await act(...)`, not `expect(act(...)).resolves.not.toThrow()`
    // - wrapping act()'s return value in expect().resolves breaks its
    // effect-flushing (the state update lands too late for the assertions
    // below to observe it). A throw inside the callback below would still
    // fail this test on its own, since it's an unhandled rejection in an
    // async test function.
    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(api.setAccessToken).toHaveBeenCalledWith(null)
  })

  it('still resolves and clears state when the /auth/logout fetch resolves with a non-ok response', async () => {
    const fetchMock = mockFetch({
      ...loggedInMountMocks(),
      logout: () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthProvider())
    await waitFor(() => expect(result.current.user).toEqual(mockUser))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(api.setAccessToken).toHaveBeenCalledWith(null)
  })
})
