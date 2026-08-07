import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { buildLoginUrlMock } = vi.hoisted(() => ({
  buildLoginUrlMock: vi.fn(),
}))

vi.mock('../lib/authRedirect', () => ({
  buildSchluesselLoginUrl: buildLoginUrlMock,
}))

import { apiClient } from '../lib/api'
import { router } from '../router'

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
  apiClient.setAccessToken(null)
  buildLoginUrlMock.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorizedResponse()))

  originalLocation = window.location
  // @ts-expect-error -- jsdom permits replacing Location with the fields used by auth
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

describe('global login redirect single-flight', () => {
  it('shares one login URL request between route auth and a concurrent API 401', async () => {
    let resolveLogin!: (url: string) => void
    buildLoginUrlMock.mockImplementation(() => new Promise<string>((resolve) => { resolveLogin = resolve }))
    const protectedRoute = router.routesById['/protected'] as unknown as {
      options: { beforeLoad: () => Promise<void> }
    }

    const routeAuth = protectedRoute.options.beforeLoad()
    const apiRequest = apiClient.get('/accounts')
    await apiRequest.catch(() => undefined)

    expect(buildLoginUrlMock).toHaveBeenCalledTimes(1)
    expect(buildLoginUrlMock).toHaveBeenCalledWith('/transactions?type=expense')

    resolveLogin('https://auth.example.com/login')
    await routeAuth
    expect(window.location.href).toBe('https://auth.example.com/login')
  })
})
