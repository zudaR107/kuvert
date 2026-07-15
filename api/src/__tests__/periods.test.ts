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

  it("includes an account's opening-balance transaction in toBeBudgeted for the period covering today", async () => {
    // Period range deliberately spans "today" (system date), since account
    // creation now stamps its opening transaction with today's date.
    const period = await (await post('/periods', { name: 'Current', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any

    // Positive initialBalance -> an income transaction dated today, which
    // should now flow into toBeBudgeted just like any other income tx.
    await post('/accounts', { name: 'New Account', initialBalance: 8000000 })

    const body = await (await get(`/periods/${period.id}/budget`)).json() as any
    // No envelopes/allocations set up -> toBeBudgeted = 8000000 - 0
    expect(body.toBeBudgeted).toBe(8000000)
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

// ── Rollover behavior ──────────────────────────────────────────────
// Dates are deliberately fixed in the past (2024) for "already ended" periods
// and far in the future (2027) for "not yet ended" periods, to avoid any
// flakiness around the exact current date.
describe('Rollover behavior', () => {
  describe('GET /periods/:id/budget — computed carriedOver', () => {
    it('is 0 for a period with no preceding period', async () => {
      const period = await (await post('/periods', { name: 'Only', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const body = await (await get(`/periods/${period.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(0)
    })

    it("rolls the previous (closed) period's leftover into carriedOver for a rollover-enabled envelope", async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries', rolloverEnabled: true })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      // period1 leftover = 10000 + 0 - 3000 = 7000

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(7000)
      expect(env.available).toBe(7000) // carriedOver(7000) + allocated(0) - spent(0)
    })

    it('does not roll over for an envelope with rolloverEnabled: false, even with leftover in the prior period', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Fun', rolloverEnabled: false })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      // period1 leftover = 7000, but rollover is disabled for this envelope

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(0)
    })

    it('clamps a negative leftover (previous period overspent) to 0 instead of carrying a negative amount', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 5000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 8000, date: '2024-01-15',
      })
      // period1 available = 5000 - 8000 = -3000 → must clamp to 0 going into period2

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(0)
    })

    it('does not roll over from a chronologically-previous period that has not ended yet', async () => {
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      // This "previous" period hasn't ended yet (endDate far in the future).
      const period1 = await (await post('/periods', { name: 'Future Jan', startDate: '2027-01-01', endDate: '2027-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Future Feb', startDate: '2027-02-01', endDate: '2027-02-28' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      // No spending, so period1's available would be 10000 if it counted — but it hasn't closed yet.

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(0)
    })

    it("picks the period with the latest endDate strictly before the target period's startDate, not just any earlier period", async () => {
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const periodA = await (await post('/periods', { name: 'A', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const periodB = await (await post('/periods', { name: 'B', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any
      // Gap in March — target starts in April, so both A and B precede it chronologically.
      const target = await (await post('/periods', { name: 'Target', startDate: '2024-04-01', endDate: '2024-04-30' })).json() as any

      // B is allocated first, deliberately, while A still has no envelope_budgets
      // row of its own — so B's own carriedOver locks in at 0 here rather than
      // compounding A's leftover into it (that compounding is covered by the
      // dedicated chained-rollover tests below). This test is only about
      // selection: does the target correctly pick B (not A) as its immediate
      // predecessor.
      await put(`/periods/${periodB.id}/budget/${envelope.id}`, { allocated: 2222 })
      await put(`/periods/${periodA.id}/budget/${envelope.id}`, { allocated: 1111 })
      // No spending in either — periodA leftover = 1111, periodB leftover = 2222.
      // B has the later endDate of the two, so B is the "previous period" for target.

      const body = await (await get(`/periods/${target.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(2222)
    })

    it('computes carryover independently per envelope', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const rolloverEnv = await (await post('/envelopes', { name: 'Groceries', rolloverEnabled: true })).json() as any
      const noRolloverEnv = await (await post('/envelopes', { name: 'Fun', rolloverEnabled: false })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${rolloverEnv.id}`, { allocated: 10000 })
      await put(`/periods/${period1.id}/budget/${noRolloverEnv.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: rolloverEnv.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      await post('/transactions', {
        accountId: account.id, envelopeId: noRolloverEnv.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      // Both envelopes have an identical 7000 leftover in period1.

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const rEnv = body.envelopes.find((e: any) => e.envelope.id === rolloverEnv.id)
      const nEnv = body.envelopes.find((e: any) => e.envelope.id === noRolloverEnv.id)
      expect(rEnv.carriedOver).toBe(7000)
      expect(nEnv.carriedOver).toBe(0)
    })
  })

  describe('PUT /periods/:id/budget/:envelopeId — locking in carriedOver', () => {
    it('persists the computed carriedOver on first allocation into a new period', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      // period1 leftover = 7000

      const res = await put(`/periods/${period2.id}/budget/${envelope.id}`, { allocated: 1000 })
      expect(res.status).toBe(201)
      const body = await res.json() as any
      expect(body.allocated).toBe(1000)
      expect(body.carriedOver).toBe(7000)
    })

    it('keeps the locked-in carriedOver value even if the previous period changes afterwards', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 3000, date: '2024-01-15',
      })
      // period1 leftover = 7000 at the moment period2's row gets locked in.

      await put(`/periods/${period2.id}/budget/${envelope.id}`, { allocated: 1000 })

      // Retroactively change period1's leftover — this must NOT affect the already-locked row.
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 2000, date: '2024-01-20',
      })
      // period1 leftover is now 5000, but period2's carriedOver was already persisted at 7000.

      const body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const env = body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(env.carriedOver).toBe(7000)
    })
  })

  describe('Chained rollover across multiple periods', () => {
    it('compounds leftover across a 3-period chain when intermediate periods are never explicitly viewed or allocated into', async () => {
      const account = await (await post('/accounts', { name: 'Cash' })).json() as any
      const envelope = await (await post('/envelopes', { name: 'Groceries' })).json() as any

      const period1 = await (await post('/periods', { name: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31' })).json() as any
      const period2 = await (await post('/periods', { name: 'Feb', startDate: '2024-02-01', endDate: '2024-02-29' })).json() as any
      const period3 = await (await post('/periods', { name: 'Mar', startDate: '2024-03-01', endDate: '2024-03-31' })).json() as any

      await put(`/periods/${period1.id}/budget/${envelope.id}`, { allocated: 10000 })
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 4000, date: '2024-01-15',
      })
      // period1 leftover = 10000 - 4000 = 6000

      // First hop: period2 (no explicit budget row) should compute carriedOver = 6000.
      const period2Body = await (await get(`/periods/${period2.id}/budget`)).json() as any
      const period2Env = period2Body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(period2Env.carriedOver).toBe(6000)

      // period2 accrues its own spending, but nobody ever allocates into it (no PUT — no persisted row).
      await post('/transactions', {
        accountId: account.id, envelopeId: envelope.id, type: 'expense', amount: 1000, date: '2024-02-10',
      })
      // period2's own leftover = carriedOver(6000) + allocated(0) - spent(1000) = 5000

      // Second hop: period3 should reflect the compounded chain (6000 → 5000), not just period1's leftover.
      const period3Body = await (await get(`/periods/${period3.id}/budget`)).json() as any
      const period3Env = period3Body.envelopes.find((e: any) => e.envelope.id === envelope.id)
      expect(period3Env.carriedOver).toBe(5000)
    })
  })
})
