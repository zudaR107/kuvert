import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { buildLoginUrlMock } = vi.hoisted(() => ({
  buildLoginUrlMock: vi.fn(),
}))

vi.mock('../lib/authRedirect', () => ({
  buildSchluesselLoginUrl: buildLoginUrlMock,
}))

import { apiClient } from '../lib/api'

function unauthorizedResponse(): Response {
  return {
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'Unauthorized' }),
    text: () => Promise.resolve('Unauthorized'),
  } as Response
}

let originalLocation: Location

beforeEach(() => {
  apiClient.setAccessToken('expired-token')
  sessionStorage.clear()
  buildLoginUrlMock.mockReset()
  buildLoginUrlMock.mockImplementation(async () => {
    sessionStorage.setItem('schloss_pkce_code_verifier', 'one-verifier')
    return 'https://auth.example.com/login'
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorizedResponse()))

  originalLocation = window.location
  // @ts-expect-error -- jsdom permits replacing Location with the fields used by the client
  delete window.location
  // @ts-expect-error -- minimal mutable Location stub for redirect assertions
  window.location = { pathname: '/transactions', search: '?type=expense', href: '' }
})

afterEach(() => {
  // @ts-expect-error -- restore jsdom's original Location object
  window.location = originalLocation
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('API unauthorized redirect', () => {
  it('starts only one PKCE verifier and redirect for concurrent unauthorized requests', async () => {
    const results = await Promise.allSettled([
      apiClient.get('/accounts'),
      apiClient.get('/transactions'),
    ])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(buildLoginUrlMock).toHaveBeenCalledTimes(1)
    expect(buildLoginUrlMock).toHaveBeenCalledWith('/transactions?type=expense')
    expect(sessionStorage.getItem('schloss_pkce_code_verifier')).toBe('one-verifier')
    expect(window.location.href).toBe('https://auth.example.com/login')
  })
})
