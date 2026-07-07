import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()

const H1 = { Authorization: 'Bearer test-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }

const get = (path: string) => app.request(path, { headers: H1 })
const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: JSON_H1, body: JSON.stringify(body) })
const put = (path: string, body: unknown) =>
  app.request(path, { method: 'PUT', headers: JSON_H1, body: JSON.stringify(body) })
const del = (path: string) => app.request(path, { method: 'DELETE', headers: H1 })

beforeEach(() => cleanDb())

// Create a shared account for transaction tests
async function mkAccount(name = 'Bank') {
  return (await (await post('/accounts', { name })).json()) as any
}

describe('GET /transactions', () => {
  it('returns empty array when no transactions', async () => {
    const res = await get('/transactions')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /transactions', () => {
  it('creates an income transaction and returns 201', async () => {
    const acct = await mkAccount()
    const res = await post('/transactions', {
      accountId: acct.id,
      type: 'income',
      amount: 10000,
      date: '2026-07-01',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.type).toBe('income')
    expect(body.amount).toBe(10000)
    expect(body.date).toBe('2026-07-01')
    expect(body.userId).toBe('user-1')
    expect(body.accountId).toBe(acct.id)
  })

  it('creates an expense transaction', async () => {
    const acct = await mkAccount()
    const res = await post('/transactions', {
      accountId: acct.id,
      type: 'expense',
      amount: 500,
      date: '2026-07-02',
      note: 'Coffee',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.type).toBe('expense')
    expect(body.note).toBe('Coffee')
  })

  it('creates a transfer transaction', async () => {
    const from = await mkAccount('From')
    const to = await mkAccount('To')
    const res = await post('/transactions', {
      accountId: from.id,
      toAccountId: to.id,
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })
    expect(res.status).toBe(201)
    expect((await res.json() as any).type).toBe('transfer')
  })

  it('returns 400 for missing required fields', async () => {
    const res = await post('/transactions', { type: 'income', amount: 100 })
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-positive amount', async () => {
    const acct = await mkAccount()
    const res = await post('/transactions', {
      accountId: acct.id,
      type: 'expense',
      amount: 0,
      date: '2026-07-01',
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /transactions with filters', () => {
  it('filters by accountId', async () => {
    const a1 = await mkAccount('A1')
    const a2 = await mkAccount('A2')
    await post('/transactions', { accountId: a1.id, type: 'income', amount: 100, date: '2026-07-01' })
    await post('/transactions', { accountId: a2.id, type: 'income', amount: 200, date: '2026-07-01' })

    const res = await get(`/transactions?accountId=${a1.id}`)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0]!.accountId).toBe(a1.id)
  })

  it('filters by type', async () => {
    const acct = await mkAccount()
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })
    await post('/transactions', { accountId: acct.id, type: 'expense', amount: 50, date: '2026-07-02' })

    const res = await get('/transactions?type=expense')
    const body = await res.json() as any[]
    expect(body.every((t: any) => t.type === 'expense')).toBe(true)
    expect(body).toHaveLength(1)
  })

  it('filters by date range (from/to)', async () => {
    const acct = await mkAccount()
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-06-30' })
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 200, date: '2026-07-15' })
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 300, date: '2026-08-01' })

    const res = await get('/transactions?from=2026-07-01&to=2026-07-31')
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0]!.amount).toBe(200)
  })

  it('filters by envelopeId', async () => {
    const acct = await mkAccount()
    const env = await (await post('/envelopes', { name: 'Food' })).json() as any
    await post('/transactions', { accountId: acct.id, envelopeId: env.id, type: 'expense', amount: 100, date: '2026-07-01' })
    await post('/transactions', { accountId: acct.id, type: 'expense', amount: 200, date: '2026-07-01' })

    const res = await get(`/transactions?envelopeId=${env.id}`)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0]!.envelopeId).toBe(env.id)
  })
})

describe('PUT /transactions/:id', () => {
  it('updates a transaction', async () => {
    const acct = await mkAccount()
    const tx = await (await post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })).json() as any
    const res = await put(`/transactions/${tx.id}`, { amount: 999 })
    expect(res.status).toBe(200)
    expect((await res.json() as any).amount).toBe(999)
  })

  it('returns 404 for unknown id', async () => {
    const res = await put('/transactions/nope', { amount: 100 })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /transactions/:id', () => {
  it('deletes a transaction and returns { ok: true }', async () => {
    const acct = await mkAccount()
    const tx = await (await post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })).json() as any
    const res = await del(`/transactions/${tx.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/transactions/nope')).status).toBe(404)
  })
})
