import { describe, it, expect } from 'vitest'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'

describe('buildSchluesselLoginUrl', () => {
  it('points at the schlussel login page by default', () => {
    const url = buildSchluesselLoginUrl('/budget', 'http://localhost:5174')
    expect(url.startsWith('http://localhost:4001/login?')).toBe(true)
  })

  it('encodes a return_to that targets this app\'s /auth/callback with the original path preserved', () => {
    const url = buildSchluesselLoginUrl('/transactions?foo=bar', 'http://localhost:5174')
    const params = new URLSearchParams(url.split('?')[1])
    const returnTo = params.get('return_to')
    expect(returnTo).not.toBeNull()

    const returnToUrl = new URL(returnTo as string)
    expect(returnToUrl.origin).toBe('http://localhost:5174')
    expect(returnToUrl.pathname).toBe('/auth/callback')
    expect(returnToUrl.searchParams.get('next')).toBe('/transactions?foo=bar')
  })

  it('uses the given origin, not a hardcoded one', () => {
    const url = buildSchluesselLoginUrl('/budget', 'https://kuvert.example.com')
    const params = new URLSearchParams(url.split('?')[1])
    const returnTo = new URL(params.get('return_to') as string)
    expect(returnTo.origin).toBe('https://kuvert.example.com')
  })
})
