import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildSchluesselLoginUrl, buildSchluesselLogoutUrl, buildSchluesselAccountUrl, CODE_VERIFIER_STORAGE_KEY } from '../lib/authRedirect'

beforeEach(() => {
  sessionStorage.clear()
})

// Mirrors the stubLocation() convention used in Layout.test.tsx / Header.test.tsx:
// jsdom allows reassigning window.location for test purposes. We additionally pin
// `origin` here (those files only needed `href`/`pathname`) since the default
// return_to depends on window.location.origin.
function stubLocation(origin: string) {
  const original = window.location
  // @ts-expect-error -- jsdom allows reassigning location for test purposes
  delete window.location
  // @ts-expect-error -- minimal stub, only `origin`/`href`/`pathname` are read by the code under test
  window.location = { ...original, origin, href: '', pathname: '/budget' }
  return () => {
    // @ts-expect-error -- restoring jsdom's original Location object
    window.location = original
  }
}

describe('buildSchluesselLoginUrl', () => {
  it('points at the schlussel login page by default', async () => {
    const url = await buildSchluesselLoginUrl('/budget', 'http://localhost:5174')
    expect(url.startsWith('http://localhost:4001/login?')).toBe(true)
  })

  it('encodes a return_to that targets this app\'s /auth/callback with the original path preserved', async () => {
    const url = await buildSchluesselLoginUrl('/transactions?foo=bar', 'http://localhost:5174')
    const params = new URLSearchParams(url.split('?')[1])
    const returnTo = params.get('return_to')
    expect(returnTo).not.toBeNull()

    const returnToUrl = new URL(returnTo as string)
    expect(returnToUrl.origin).toBe('http://localhost:5174')
    expect(returnToUrl.pathname).toBe('/auth/callback')
    expect(returnToUrl.searchParams.get('next')).toBe('/transactions?foo=bar')
  })

  it('uses the given origin, not a hardcoded one', async () => {
    const url = await buildSchluesselLoginUrl('/budget', 'https://kuvert.example.com')
    const params = new URLSearchParams(url.split('?')[1])
    const returnTo = new URL(params.get('return_to') as string)
    expect(returnTo.origin).toBe('https://kuvert.example.com')
  })

  it('stores a PKCE code_verifier in sessionStorage before resolving', async () => {
    expect(sessionStorage.length).toBe(0)
    await buildSchluesselLoginUrl('/budget', 'http://localhost:5174')
    expect(sessionStorage.length).toBeGreaterThanOrEqual(1)
  })

  it('includes a code_challenge and code_challenge_method=S256 in the URL', async () => {
    const url = await buildSchluesselLoginUrl('/budget', 'http://localhost:5174')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('code_challenge_method')).toBe('S256')

    const codeChallenge = params.get('code_challenge')
    expect(codeChallenge).not.toBeNull()
    expect((codeChallenge as string).length).toBeGreaterThanOrEqual(40)
    expect(codeChallenge as string).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generates a fresh code_challenge on every call', async () => {
    const url1 = await buildSchluesselLoginUrl('/budget', 'http://localhost:5174')
    const url2 = await buildSchluesselLoginUrl('/budget', 'http://localhost:5174')

    const challenge1 = new URLSearchParams(url1.split('?')[1]).get('code_challenge')
    const challenge2 = new URLSearchParams(url2.split('?')[1]).get('code_challenge')

    expect(challenge1).not.toBeNull()
    expect(challenge2).not.toBeNull()
    expect(challenge1).not.toBe(challenge2)
  })
})

describe('buildSchluesselLogoutUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('points at the schlussel logout page', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'https://schlussel.example.com')
    const url = buildSchluesselLogoutUrl('https://kuvert.test/budget')
    expect(url.startsWith('https://schlussel.example.com/logout?')).toBe(true)
  })

  it('falls back to http://localhost:4001 when VITE_SCHLUSSEL_URL is unset', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', undefined)
    const url = buildSchluesselLogoutUrl('https://kuvert.test/budget')
    expect(url.startsWith('http://localhost:4001/logout?')).toBe(true)
  })

  it('encodes an explicit returnTo argument into the return_to query param', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const url = buildSchluesselLogoutUrl('https://kuvert.test/budget')

    expect(url).toContain(`return_to=${encodeURIComponent('https://kuvert.test/budget')}`)

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('return_to')).toBe('https://kuvert.test/budget')
  })

  it('defaults returnTo to the current page origin plus a trailing slash when omitted', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const restore = stubLocation('https://kuvert.example.com')

    const url = buildSchluesselLogoutUrl()
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('return_to')).toBe('https://kuvert.example.com/')

    restore()
  })

  it('does not touch sessionStorage or generate a PKCE code_verifier', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    expect(sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY)).toBeNull()

    buildSchluesselLogoutUrl('https://kuvert.test/budget')

    expect(sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('is synchronous and returns a plain string, not a Promise', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const result = buildSchluesselLogoutUrl('https://kuvert.test/budget')

    expect(result).not.toBeInstanceOf(Promise)
    expect(typeof result).toBe('string')
  })
})

describe('buildSchluesselAccountUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('points at the schlussel account page', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'https://schlussel.example.com')
    const url = buildSchluesselAccountUrl('/budget', 'http://localhost:5174')
    expect(url.startsWith('https://schlussel.example.com/account?')).toBe(true)
  })

  it('falls back to http://localhost:4001 when VITE_SCHLUSSEL_URL is unset', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', undefined)
    const url = buildSchluesselAccountUrl('/budget', 'http://localhost:5174')
    expect(url.startsWith('http://localhost:4001/account?')).toBe(true)
  })

  it('encodes return_to as the given origin plus the given path', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const url = buildSchluesselAccountUrl('/transactions?foo=bar', 'https://kuvert.example.com')

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('return_to')).toBe('https://kuvert.example.com/transactions?foo=bar')
  })

  it('defaults origin to window.location.origin when omitted', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const restore = stubLocation('https://kuvert.example.com')

    const url = buildSchluesselAccountUrl('/goals')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('return_to')).toBe('https://kuvert.example.com/goals')

    restore()
  })

  it('does not touch sessionStorage or generate a PKCE code_verifier', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    expect(sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY)).toBeNull()

    buildSchluesselAccountUrl('/budget', 'http://localhost:5174')

    expect(sessionStorage.getItem(CODE_VERIFIER_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('is synchronous and returns a plain string, not a Promise', () => {
    vi.stubEnv('VITE_SCHLUSSEL_URL', 'http://localhost:4001')
    const result = buildSchluesselAccountUrl('/budget', 'http://localhost:5174')

    expect(result).not.toBeInstanceOf(Promise)
    expect(typeof result).toBe('string')
  })
})
