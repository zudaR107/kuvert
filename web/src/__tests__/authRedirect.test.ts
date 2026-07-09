import { describe, it, expect, beforeEach } from 'vitest'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'

beforeEach(() => {
  sessionStorage.clear()
})

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
