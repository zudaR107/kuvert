import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock the db and auth modules before any imports that use them ───
vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb, sqlite } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()

// ── Typed request helpers ──────────────────────────────────────────
const H1 = { Authorization: 'Bearer test-token' }
const H2 = { Authorization: 'Bearer user2-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }

const get = (path: string, headers = H1) => app.request(path, { headers })
const post = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
const put = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'PUT', headers, body: JSON.stringify(body) })
const del = (path: string, headers = H1) => app.request(path, { method: 'DELETE', headers })

beforeEach(() => cleanDb())

// ── Health ─────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', service: 'Kuvert' })
  })
})

// ── Auth guard ─────────────────────────────────────────────────────
describe('auth guard', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/accounts')
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid token', async () => {
    const res = await app.request('/accounts', {
      headers: { Authorization: 'Bearer bad-token' },
    })
    expect(res.status).toBe(401)
  })
})

// ── Accounts CRUD ──────────────────────────────────────────────────
describe('GET /accounts', () => {
  it('returns empty array when no accounts', async () => {
    const res = await get('/accounts')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns list of user accounts', async () => {
    await post('/accounts', { name: 'Checking' })
    const res = await get('/accounts')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0]!.name).toBe('Checking')
  })
})

describe('POST /accounts', () => {
  it('creates an account with only name and returns 201', async () => {
    const res = await post('/accounts', { name: 'My Account' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('My Account')
    expect(body.type).toBe('checking')
    expect(body.currency).toBe('RUB')
    expect(body.initialBalance).toBe(0)
    expect(body.archived).toBe(false)
    expect(body.userId).toBe('user-1')
  })

  it('creates an account with all fields', async () => {
    const res = await post('/accounts', {
      name: 'Savings',
      type: 'savings',
      currency: 'USD',
      initialBalance: 50000,
      color: '#ff0000',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.type).toBe('savings')
    expect(body.currency).toBe('USD')
    expect(body.initialBalance).toBe(50000)
    expect(body.color).toBe('#ff0000')
  })

  it('returns 400 for missing name', async () => {
    const res = await post('/accounts', { type: 'checking' })
    expect(res.status).toBe(400)
  })
})

describe('GET /accounts/:id', () => {
  it('returns 200 with account data', async () => {
    const created = await (await post('/accounts', { name: 'Test' })).json() as any
    const res = await get(`/accounts/${created.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe(created.id)
    expect(body.name).toBe('Test')
  })

  it('returns 404 for unknown id', async () => {
    const res = await get('/accounts/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('PUT /accounts/:id', () => {
  it('updates an account and returns updated data', async () => {
    const created = await (await post('/accounts', { name: 'Old Name' })).json() as any
    const res = await put(`/accounts/${created.id}`, { name: 'New Name' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.name).toBe('New Name')
    expect(body.id).toBe(created.id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await put('/accounts/nonexistent', { name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /accounts/:id', () => {
  it('soft-deletes account and returns { ok: true }', async () => {
    const created = await (await post('/accounts', { name: 'ToDelete' })).json() as any
    const res = await del(`/accounts/${created.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('soft-deleted account no longer appears in GET /accounts', async () => {
    const created = await (await post('/accounts', { name: 'Gone' })).json() as any
    await del(`/accounts/${created.id}`)
    const list = await (await get('/accounts')).json() as any[]
    expect(list.find((a: any) => a.id === created.id)).toBeUndefined()
  })

  it('returns 404 for unknown id', async () => {
    const res = await del('/accounts/nonexistent')
    expect(res.status).toBe(404)
  })
})

// ── Balance ────────────────────────────────────────────────────────
describe('GET /accounts/:id/balance', () => {
  it('returns initialBalance when no transactions', async () => {
    const acct = await (await post('/accounts', { name: 'A', initialBalance: 10000 })).json() as any
    const res = await get(`/accounts/${acct.id}/balance`)
    expect(res.status).toBe(200)
    expect((await res.json() as any).balance).toBe(10000)
  })

  it('adds income transactions to balance', async () => {
    const acct = await (await post('/accounts', { name: 'A', initialBalance: 0 })).json() as any
    await post('/transactions', {
      accountId: acct.id,
      type: 'income',
      amount: 5000,
      date: '2026-01-01',
    })
    const res = await get(`/accounts/${acct.id}/balance`)
    expect((await res.json() as any).balance).toBe(5000)
  })

  it('subtracts expense transactions from balance', async () => {
    const acct = await (await post('/accounts', { name: 'A', initialBalance: 10000 })).json() as any
    await post('/transactions', {
      accountId: acct.id,
      type: 'expense',
      amount: 3000,
      date: '2026-01-01',
    })
    const res = await get(`/accounts/${acct.id}/balance`)
    expect((await res.json() as any).balance).toBe(7000)
  })

  it('combines initialBalance + income - expense correctly', async () => {
    const acct = await (await post('/accounts', { name: 'A', initialBalance: 1000 })).json() as any
    await post('/transactions', {
      accountId: acct.id,
      type: 'income',
      amount: 2000,
      date: '2026-01-01',
    })
    await post('/transactions', {
      accountId: acct.id,
      type: 'expense',
      amount: 500,
      date: '2026-01-02',
    })
    // 1000 + 2000 - 500 = 2500
    expect((await (await get(`/accounts/${acct.id}/balance`)).json() as any).balance).toBe(2500)
  })

  it('returns 404 for unknown account', async () => {
    const res = await get('/accounts/nonexistent/balance')
    expect(res.status).toBe(404)
  })
})
