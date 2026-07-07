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

// ── Periods CRUD ───────────────────────────────────────────────────
describe('GET /periods', () => {
  it('returns empty array initially', async () => {
    const res = await get('/periods')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns periods ordered by startDate descending', async () => {
    await post('/periods', { name: 'Jan', startDate: '2026-01-01', endDate: '2026-01-31' })
    await post('/periods', { name: 'Mar', startDate: '2026-03-01', endDate: '2026-03-31' })
    await post('/periods', { name: 'Feb', startDate: '2026-02-01', endDate: '2026-02-28' })

    const body = await (await get('/periods')).json() as any[]
    expect(body.map((p: any) => p.name)).toEqual(['Mar', 'Feb', 'Jan'])
  })
})

describe('POST /periods', () => {
  it('creates a period and returns 201', async () => {
    const res = await post('/periods', {
      name: 'July 2026',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('July 2026')
    expect(body.startDate).toBe('2026-07-01')
    expect(body.endDate).toBe('2026-07-31')
    expect(body.userId).toBe('user-1')
  })

  it('returns 400 for missing fields', async () => {
    const res = await post('/periods', { name: 'Bad' })
    expect(res.status).toBe(400)
  })
})

describe('GET /periods/:id', () => {
  it('returns period by id', async () => {
    const created = await (await post('/periods', { name: 'P', startDate: '2026-01-01', endDate: '2026-01-31' })).json() as any
    const res = await get(`/periods/${created.id}`)
    expect(res.status).toBe(200)
    expect((await res.json() as any).id).toBe(created.id)
  })

  it('returns 404 for unknown id', async () => {
    expect((await get('/periods/nope')).status).toBe(404)
  })
})

describe('DELETE /periods/:id', () => {
  it('deletes period and returns { ok: true }', async () => {
    const created = await (await post('/periods', { name: 'P', startDate: '2026-01-01', endDate: '2026-01-31' })).json() as any
    const res = await del(`/periods/${created.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/periods/nope')).status).toBe(404)
  })
})

// ── Budget endpoint ────────────────────────────────────────────────
describe('GET /periods/:id/budget', () => {
  it('returns 404 for unknown period', async () => {
    expect((await get('/periods/nope/budget')).status).toBe(404)
  })

  it('returns empty envelopes list when no envelopes exist', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const res = await get(`/periods/${period.id}/budget`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.period.id).toBe(period.id)
    expect(body.envelopes).toEqual([])
    expect(body.toBeBudgeted).toBe(0)
  })

  it('shows allocated=0, spent=0, available=0 for an envelope with no budget set', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    await post('/envelopes', { name: 'Groceries' })

    const body = await (await get(`/periods/${period.id}/budget`)).json() as any
    expect(body.envelopes).toHaveLength(1)
    const env = body.envelopes[0]
    expect(env.allocated).toBe(0)
    expect(env.carriedOver).toBe(0)
    expect(env.spent).toBe(0)
    expect(env.available).toBe(0)
  })

  it('shows correct allocated/available after PUT budget', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

    await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 20000 })

    const body = await (await get(`/periods/${period.id}/budget`)).json() as any
    const envBudget = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
    expect(envBudget.allocated).toBe(20000)
    expect(envBudget.available).toBe(20000) // allocated + 0 - 0
  })

  it('calculates spent from expense transactions within period dates', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const envelope = await (await post('/envelopes', { name: 'Food' })).json() as any
    const account = await (await post('/accounts', { name: 'Cash' })).json() as any

    await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 30000 })

    // Expense in period
    await post('/transactions', {
      accountId: account.id,
      envelopeId: envelope.id,
      type: 'expense',
      amount: 5000,
      date: '2026-07-15',
    })
    // Expense outside period — should NOT be counted
    await post('/transactions', {
      accountId: account.id,
      envelopeId: envelope.id,
      type: 'expense',
      amount: 9999,
      date: '2026-08-01',
    })

    const body = await (await get(`/periods/${period.id}/budget`)).json() as any
    const envBudget = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
    expect(envBudget.spent).toBe(5000)
    expect(envBudget.available).toBe(25000) // 30000 - 5000
  })

  it('calculates toBeBudgeted = total income in period - total allocated', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const envelope = await (await post('/envelopes', { name: 'Food' })).json() as any
    const account = await (await post('/accounts', { name: 'Bank' })).json() as any

    // Income in period
    await post('/transactions', {
      accountId: account.id,
      type: 'income',
      amount: 100000,
      date: '2026-07-01',
    })
    // Income outside period — should NOT count
    await post('/transactions', {
      accountId: account.id,
      type: 'income',
      amount: 50000,
      date: '2026-06-30',
    })

    await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 20000 })

    const body = await (await get(`/periods/${period.id}/budget`)).json() as any
    // toBeBudgeted = 100000 - 20000 = 80000
    expect(body.toBeBudgeted).toBe(80000)
  })
})

// ── PUT /periods/:id/budget/:envelopeId ────────────────────────────
describe('PUT /periods/:id/budget/:envelopeId', () => {
  it('inserts a new budget record and returns 201', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const envelope = await (await post('/envelopes', { name: 'E' })).json() as any

    const res = await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 5000 })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.allocated).toBe(5000)
    expect(body.envelopeId).toBe(envelope.id)
    expect(body.periodId).toBe(period.id)
  })

  it('updates an existing budget record and returns 200', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const envelope = await (await post('/envelopes', { name: 'E' })).json() as any

    await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 5000 })
    const res = await put(`/periods/${period.id}/budget/${envelope.id}`, { allocated: 8000 })
    expect(res.status).toBe(200)
    expect((await res.json() as any).allocated).toBe(8000)
  })

  it('returns 404 when period does not exist', async () => {
    const envelope = await (await post('/envelopes', { name: 'E' })).json() as any
    const res = await put(`/periods/nope/budget/${envelope.id}`, { allocated: 100 })
    expect(res.status).toBe(404)
  })

  it('returns 404 when envelope does not exist', async () => {
    const period = await (await post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    const res = await put(`/periods/${period.id}/budget/nope`, { allocated: 100 })
    expect(res.status).toBe(404)
  })
})
