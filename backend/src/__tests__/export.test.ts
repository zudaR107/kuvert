import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()
const H1 = { Authorization: 'Bearer test-token' }
const H2 = { Authorization: 'Bearer user2-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }
const JSON_H2 = { ...H2, 'Content-Type': 'application/json' }

const post = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
const put = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'PUT', headers, body: JSON.stringify(body) })

beforeEach(() => cleanDb())

describe('GET /export', () => {
  it('includes the caller\'s service-local currency preference', async () => {
    await put('/users/me', { currency: 'USD' })

    const res = await app.request('/export', { headers: H1 })
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('"currency":"USD"')
  })

  it('exports every Kuvert collection while excluding another user\'s records', async () => {
    const ownAccount = await (await post('/accounts', { name: 'Own Account' })).json() as any
    const otherAccount = await (await post('/accounts', { name: 'Other Account' }, JSON_H2)).json() as any

    const ownPeriod = await (await post('/periods', {
      name: 'Own Period', startDate: '2026-07-01', endDate: '2026-07-31',
    })).json() as any
    const otherPeriod = await (await post('/periods', {
      name: 'Other Period', startDate: '2026-07-01', endDate: '2026-07-31',
    }, JSON_H2)).json() as any

    const ownCategory = await (await post('/envelopes/categories', { name: 'Own Category' })).json() as any
    const otherCategory = await (await post('/envelopes/categories', { name: 'Other Category' }, JSON_H2)).json() as any
    const ownEnvelope = await (await post('/envelopes', {
      name: 'Own Envelope', categoryId: ownCategory.id,
    })).json() as any
    const otherEnvelope = await (await post('/envelopes', {
      name: 'Other Envelope', categoryId: otherCategory.id,
    }, JSON_H2)).json() as any

    const ownBudget = await (await put(`/periods/${ownPeriod.id}/budget/${ownEnvelope.id}`, { allocated: 1200 })).json() as any
    const otherBudget = await (await put(
      `/periods/${otherPeriod.id}/budget/${otherEnvelope.id}`,
      { allocated: 3400 },
      JSON_H2,
    )).json() as any

    const ownTransaction = await (await post('/transactions', {
      accountId: ownAccount.id, type: 'income', amount: 5000, date: '2026-07-01',
    })).json() as any
    const otherTransaction = await (await post('/transactions', {
      accountId: otherAccount.id, type: 'income', amount: 6000, date: '2026-07-01',
    }, JSON_H2)).json() as any

    const ownGoal = await (await post('/goals', { name: 'Own Goal', targetAmount: 10000 })).json() as any
    const otherGoal = await (await post('/goals', { name: 'Other Goal', targetAmount: 10000 }, JSON_H2)).json() as any
    const ownContributionResponse = await (await post(`/goals/${ownGoal.id}/contribute`, {
      accountId: ownAccount.id, amount: 1000, date: '2026-07-02',
    })).json() as any
    const otherContributionResponse = await (await post(`/goals/${otherGoal.id}/contribute`, {
      accountId: otherAccount.id, amount: 2000, date: '2026-07-02',
    }, JSON_H2)).json() as any

    const ownDebt = await (await post('/debts', { counterparty: 'Own Debt', type: 'owed', amount: 700 })).json() as any
    const otherDebt = await (await post('/debts', {
      counterparty: 'Other Debt', type: 'owing', amount: 800,
    }, JSON_H2)).json() as any

    const res = await app.request('/export', { headers: H1 })
    expect(res.status).toBe(200)
    const body = await res.json() as any

    expect(body.scope).toBe('kuvert-account-only')
    expect(new Date(body.exportedAt).toISOString()).toBe(body.exportedAt)
    expect(body.accounts.map((row: any) => row.id)).toEqual([ownAccount.id])
    expect(body.periods.map((row: any) => row.id)).toEqual([ownPeriod.id])
    expect(body.categories.map((row: any) => row.id)).toEqual([ownCategory.id])
    expect(body.envelopes.map((row: any) => row.id)).toEqual([ownEnvelope.id])
    expect(body.envelopeBudgets.map((row: any) => row.id)).toEqual([ownBudget.id])
    expect(body.transactions.map((row: any) => row.id)).toEqual([ownTransaction.id])
    expect(body.goals.map((row: any) => row.id)).toEqual([ownGoal.id])
    expect(body.goalContributions.map((row: any) => row.id)).toEqual([ownContributionResponse.contribution.id])
    expect(body.debts.map((row: any) => row.id)).toEqual([ownDebt.id])

    const serialized = JSON.stringify(body)
    for (const foreignId of [
      otherAccount.id,
      otherPeriod.id,
      otherCategory.id,
      otherEnvelope.id,
      otherBudget.id,
      otherTransaction.id,
      otherGoal.id,
      otherContributionResponse.contribution.id,
      otherDebt.id,
    ]) {
      expect(serialized).not.toContain(foreignId)
    }
  })
})
