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

// ── Helpers ────────────────────────────────────────────────────────

/** Returns a date string N months from today (positive = future, negative = past) */
function monthsFromNow(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]!
}

async function mkGoal(overrides: Record<string, unknown> = {}) {
  return (await (await post('/goals', { name: 'Test Goal', targetAmount: 12000, ...overrides })).json()) as any
}

async function mkAccount() {
  return (await (await post('/accounts', { name: 'Bank' })).json()) as any
}

// ── Goals CRUD ─────────────────────────────────────────────────────
describe('GET /goals', () => {
  it('returns empty array initially', async () => {
    const res = await get('/goals')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('does not return archived goals', async () => {
    const g = await mkGoal()
    await del(`/goals/${g.id}`)
    const list = await (await get('/goals')).json() as any[]
    expect(list.find((x: any) => x.id === g.id)).toBeUndefined()
  })
})

describe('POST /goals', () => {
  it('creates a goal and returns 201', async () => {
    const res = await post('/goals', { name: 'Vacation', targetAmount: 200000 })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('Vacation')
    expect(body.targetAmount).toBe(200000)
    expect(body.currentAmount).toBe(0)
    expect(body.archived).toBe(false)
    expect(body.userId).toBe('user-1')
  })

  it('returns 400 for missing required fields', async () => {
    expect((await post('/goals', { name: 'X' })).status).toBe(400)
  })
})

describe('monthlyNeeded calculation', () => {
  it('is null when no deadline', async () => {
    const g = await mkGoal({ targetAmount: 12000 })
    const list = await (await get('/goals')).json() as any[]
    const found = list.find((x: any) => x.id === g.id)
    expect(found.monthlyNeeded).toBeNull()
  })

  it('is calculated correctly when deadline given', async () => {
    // Deadline exactly 12 months from now → monthsLeft = 12
    const deadline = monthsFromNow(12)
    const g = await mkGoal({ targetAmount: 12000, deadline })
    const list = await (await get('/goals')).json() as any[]
    const found = list.find((x: any) => x.id === g.id)
    // monthlyNeeded = ceil(12000 / 12) = 1000
    expect(found.monthlyNeeded).toBe(1000)
  })

  it('is never 0 or negative — minimum 1 month enforced for past deadlines', async () => {
    // Past deadline → monthsLeft = max(1, negative) = 1
    const deadline = monthsFromNow(-6)
    const g = await mkGoal({ targetAmount: 5000, deadline })
    const list = await (await get('/goals')).json() as any[]
    const found = list.find((x: any) => x.id === g.id)
    // monthsLeft = 1 → monthlyNeeded = ceil(5000 / 1) = 5000
    expect(found.monthlyNeeded).toBe(5000)
  })

  it('is 0 when currentAmount equals targetAmount', async () => {
    // To get currentAmount == targetAmount we contribute the full amount.
    // Use a past deadline so monthsLeft = 1 and the cap test is clear.
    const deadline = monthsFromNow(12)
    const g = await mkGoal({ targetAmount: 1000, deadline })
    const acct = await mkAccount()
    // Contribute exact target amount → currentAmount capped at 1000
    await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 1000, date: '2026-07-01' })

    const list = await (await get('/goals')).json() as any[]
    const found = list.find((x: any) => x.id === g.id)
    // currentAmount = targetAmount → monthlyNeeded = ceil(0 / monthsLeft) = 0
    expect(found.monthlyNeeded).toBe(0)
  })
})

describe('PUT /goals/:id', () => {
  it('updates a goal', async () => {
    const g = await mkGoal()
    const res = await put(`/goals/${g.id}`, { name: 'Updated' })
    expect(res.status).toBe(200)
    expect((await res.json() as any).name).toBe('Updated')
  })

  it('returns 404 for unknown id', async () => {
    expect((await put('/goals/nope', { name: 'X' })).status).toBe(404)
  })
})

describe('DELETE /goals/:id', () => {
  it('soft-deletes goal and returns { ok: true }', async () => {
    const g = await mkGoal()
    const res = await del(`/goals/${g.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/goals/nope')).status).toBe(404)
  })
})

// ── Contributions ──────────────────────────────────────────────────
describe('POST /goals/:id/contribute', () => {
  it('returns 201 with contribution and updated currentAmount', async () => {
    const g = await mkGoal({ targetAmount: 10000 })
    const acct = await mkAccount()
    const res = await post(`/goals/${g.id}/contribute`, {
      accountId: acct.id,
      amount: 3000,
      date: '2026-07-01',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.currentAmount).toBe(3000)
    expect(body.contribution.amount).toBe(3000)
    expect(body.contribution.goalId).toBe(g.id)
  })

  it('increments currentAmount with successive contributions', async () => {
    const g = await mkGoal({ targetAmount: 10000 })
    const acct = await mkAccount()
    await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 2000, date: '2026-07-01' })
    const res = await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 3000, date: '2026-07-02' })
    expect((await res.json() as any).currentAmount).toBe(5000)
  })

  it('caps currentAmount at targetAmount (cannot exceed)', async () => {
    const g = await mkGoal({ targetAmount: 5000 })
    const acct = await mkAccount()
    const res = await post(`/goals/${g.id}/contribute`, {
      accountId: acct.id,
      amount: 9999,
      date: '2026-07-01',
    })
    expect(res.status).toBe(201)
    // Must be capped at 5000, not 9999
    expect((await res.json() as any).currentAmount).toBe(5000)
  })

  it('returns 404 for unknown goal', async () => {
    const acct = await mkAccount()
    const res = await post('/goals/nope/contribute', { accountId: acct.id, amount: 100, date: '2026-07-01' })
    expect(res.status).toBe(404)
  })

  it('returns 400 for non-positive amount', async () => {
    const g = await mkGoal()
    const acct = await mkAccount()
    const res = await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 0, date: '2026-07-01' })
    expect(res.status).toBe(400)
  })
})

describe('GET /goals/:id/contributions', () => {
  it('returns empty array when no contributions', async () => {
    const g = await mkGoal()
    const res = await get(`/goals/${g.id}/contributions`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns list of contributions', async () => {
    const g = await mkGoal({ targetAmount: 20000 })
    const acct = await mkAccount()
    await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 1000, date: '2026-07-01' })
    await post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 2000, date: '2026-07-02' })

    const list = await (await get(`/goals/${g.id}/contributions`)).json() as any[]
    expect(list).toHaveLength(2)
    expect(list.map((c: any) => c.amount).sort((a: number, b: number) => a - b)).toEqual([1000, 2000])
  })

  it('returns 404 for unknown goal', async () => {
    expect((await get('/goals/nope/contributions')).status).toBe(404)
  })
})
