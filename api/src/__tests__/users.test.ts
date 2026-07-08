import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()

const H1 = { Authorization: 'Bearer test-token' }
const H2 = { Authorization: 'Bearer user2-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }
const JSON_H2 = { ...H2, 'Content-Type': 'application/json' }

const asUser1 = {
  get: (path: string) => app.request(path, { headers: H1 }),
  put: (path: string, body: unknown) =>
    app.request(path, { method: 'PUT', headers: JSON_H1, body: JSON.stringify(body) }),
}

const asUser2 = {
  get: (path: string) => app.request(path, { headers: H2 }),
  put: (path: string, body: unknown) =>
    app.request(path, { method: 'PUT', headers: JSON_H2, body: JSON.stringify(body) }),
}

beforeEach(() => cleanDb())

// ── GET /users/me ──────────────────────────────────────────────────
describe('GET /users/me', () => {
  it('returns the authenticated user profile with default currency', async () => {
    const res = await asUser1.get('/users/me')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe('user-1')
    expect(body.email).toBe('test@example.com')
    expect(body.name).toBe('Test User')
    expect(body.currency).toBe('RUB')
  })

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/users/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid token', async () => {
    const res = await app.request('/users/me', {
      headers: { Authorization: 'Bearer bad-token' },
    })
    expect(res.status).toBe(401)
  })
})

// ── PUT /users/me ──────────────────────────────────────────────────
describe('PUT /users/me', () => {
  it('updates currency and returns the updated profile', async () => {
    const res = await asUser1.put('/users/me', { currency: 'USD' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe('user-1')
    expect(body.email).toBe('test@example.com')
    expect(body.name).toBe('Test User')
    expect(body.currency).toBe('USD')
  })

  it('persists the currency change for subsequent GET requests', async () => {
    await asUser1.put('/users/me', { currency: 'EUR' })
    const res = await asUser1.get('/users/me')
    expect(res.status).toBe(200)
    expect((await res.json() as any).currency).toBe('EUR')
  })

  it('returns 400 for a currency string shorter than 3 characters', async () => {
    const res = await asUser1.put('/users/me', { currency: 'US' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a currency string longer than 3 characters', async () => {
    const res = await asUser1.put('/users/me', { currency: 'USDD' })
    expect(res.status).toBe(400)
  })

  it('does not change the stored currency when validation fails', async () => {
    const before = await (await asUser1.get('/users/me')).json() as any
    expect(before.currency).toBe('RUB')

    await asUser1.put('/users/me', { currency: 'X' })

    const after = await (await asUser1.get('/users/me')).json() as any
    expect(after.currency).toBe('RUB')
  })

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: 'USD' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid token', async () => {
    const res = await app.request('/users/me', {
      method: 'PUT',
      headers: { Authorization: 'Bearer bad-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: 'USD' }),
    })
    expect(res.status).toBe(401)
  })
})

// ── Cross-user isolation ───────────────────────────────────────────
describe('User isolation', () => {
  it("user-2's GET reflects only their own currency, not user-1's", async () => {
    await asUser1.put('/users/me', { currency: 'USD' })
    const res = await asUser2.get('/users/me')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe('user-2')
    expect(body.currency).toBe('RUB')
  })

  it("user-1's PUT does not affect user-2's currency", async () => {
    await asUser1.put('/users/me', { currency: 'USD' })
    const user2Profile = await (await asUser2.get('/users/me')).json() as any
    expect(user2Profile.currency).toBe('RUB')
  })

  it("user-2's PUT does not affect user-1's currency", async () => {
    await asUser2.put('/users/me', { currency: 'EUR' })
    const user1Profile = await (await asUser1.get('/users/me')).json() as any
    expect(user1Profile.currency).toBe('RUB')
  })

  it('each user independently updates their own currency', async () => {
    await asUser1.put('/users/me', { currency: 'USD' })
    await asUser2.put('/users/me', { currency: 'EUR' })

    const user1Profile = await (await asUser1.get('/users/me')).json() as any
    const user2Profile = await (await asUser2.get('/users/me')).json() as any

    expect(user1Profile.currency).toBe('USD')
    expect(user2Profile.currency).toBe('EUR')
  })
})
