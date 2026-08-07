import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb, db, sqlite } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()
const H1 = { Authorization: 'Bearer test-token' }
const H2 = { Authorization: 'Bearer user2-token' }
const DELEGATED_H1 = { Authorization: 'Bearer kuvert-export-delegation-token' }
const WRONG_SERVICE_DELEGATION = { Authorization: 'Bearer tafel-export-delegation-token' }
const WRONG_SCOPE_DELEGATION = { Authorization: 'Bearer kuvert-read-delegation-token' }
const WRONG_TOKEN_USE_DELEGATION = { Authorization: 'Bearer kuvert-access-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }
const JSON_H2 = { ...H2, 'Content-Type': 'application/json' }

const post = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
const put = (path: string, body: unknown, headers = JSON_H1) =>
  app.request(path, { method: 'PUT', headers, body: JSON.stringify(body) })
const del = (path: string, headers = H1) => app.request(path, { method: 'DELETE', headers })

beforeEach(() => cleanDb())
afterEach(() => vi.restoreAllMocks())

describe('GET /export', () => {
  it('retains the legacy route and response shape for direct consumers', async () => {
    const account = await (await post('/accounts', { name: 'Legacy Account' })).json() as any

    const res = await app.request('/export', { headers: H1 })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store, private')
    expect(res.headers.get('Pragma')).toBe('no-cache')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const body = await res.json() as any
    expect(body.scope).toBe('kuvert-account-only')
    expect(body.accounts.map((row: any) => row.id)).toEqual([account.id])
    expect(body).not.toHaveProperty('version')
    expect(body).not.toHaveProperty('data')
  })

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

async function seedCompleteSnapshot(
  prefix: string,
  headers = JSON_H1,
) {
  const authHeaders = { Authorization: headers.Authorization }
  await put('/users/me', { currency: prefix === 'Own' ? 'EUR' : 'GBP' }, headers)

  const account = await (await post('/accounts', {
    name: `${prefix} Account`, type: 'savings', currency: 'USD', initialBalance: 0,
  }, headers)).json() as any
  const transferAccount = await (await post('/accounts', {
    name: `${prefix} Transfer Account`, type: 'checking', currency: 'USD', initialBalance: 0,
  }, headers)).json() as any
  const period = await (await post('/periods', {
    name: `${prefix} Period`, startDate: '2026-08-01', endDate: '2026-08-31',
  }, headers)).json() as any
  const category = await (await post('/envelopes/categories', {
    name: `${prefix} Category`, color: '#112233',
  }, headers)).json() as any
  const envelope = await (await post('/envelopes', {
    name: `${prefix} Envelope`, categoryId: category.id, rolloverEnabled: false,
  }, headers)).json() as any
  const budget = await (await put(`/periods/${period.id}/budget/${envelope.id}`, {
    allocated: 2500,
  }, headers)).json() as any
  const transaction = await (await post('/transactions', {
    accountId: account.id,
    envelopeId: envelope.id,
    type: 'expense',
    amount: 375,
    date: '2026-08-03',
    note: `${prefix} transaction`,
  }, headers)).json() as any
  const transfer = await (await post('/transactions', {
    accountId: account.id,
    toAccountId: transferAccount.id,
    type: 'transfer',
    amount: 125,
    date: '2026-08-04',
  }, headers)).json() as any
  const goal = await (await post('/goals', {
    name: `${prefix} Goal`, targetAmount: 5000, recurring: true, recurringDay: 12,
  }, headers)).json() as any
  const contributionResponse = await (await post(`/goals/${goal.id}/contribute`, {
    accountId: account.id, amount: 425, date: '2026-08-05', note: `${prefix} contribution`,
  }, headers)).json() as any
  const debt = await (await post('/debts', {
    counterparty: `${prefix} Debt`, type: 'owing', amount: 700, currency: 'KZT', settled: true,
  }, headers)).json() as any

  expect((await del(`/accounts/${transferAccount.id}`, authHeaders)).status).toBe(200)
  expect((await del(`/envelopes/${envelope.id}`, authHeaders)).status).toBe(200)
  expect((await del(`/goals/${goal.id}`, authHeaders)).status).toBe(200)

  return {
    account,
    transferAccount,
    period,
    category,
    envelope,
    budget,
    transaction,
    transfer,
    goal,
    contribution: contributionResponse.contribution,
    debt,
  }
}

describe('GET /exports/me', () => {
  it('returns the versioned Kuvert export envelope to normal access-token auth', async () => {
    const res = await app.request('/exports/me', { headers: H1 })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store, private')
    expect(res.headers.get('Pragma')).toBe('no-cache')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const body = await res.json() as any

    expect(body).toEqual({
      version: '1',
      service: 'kuvert',
      exportedAt: expect.any(String),
      data: {
        currency: 'RUB',
        accounts: [],
        periods: [],
        categories: [],
        envelopes: [],
        envelopeBudgets: [],
        transactions: [],
        goals: [],
        goalContributions: [],
        debts: [],
      },
    })
    expect(new Date(body.exportedAt).toISOString()).toBe(body.exportedAt)
  })

  it('accepts an exact Kuvert data-export delegation and exports its subject', async () => {
    const account = await (await post('/accounts', { name: 'Delegated Subject Account' })).json() as any

    const res = await app.request('/exports/me', { headers: DELEGATED_H1 })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.service).toBe('kuvert')
    expect(body.data.accounts.map((row: any) => row.id)).toEqual([account.id])
  })

  it.each([
    ['another service audience', WRONG_SERVICE_DELEGATION],
    ['a token without the exact data:export scope', WRONG_SCOPE_DELEGATION],
    ['a token whose token_use is not export', WRONG_TOKEN_USE_DELEGATION],
  ])('rejects delegated auth with %s', async (_case, headers) => {
    const res = await app.request('/exports/me', { headers })
    expect(res.status).toBe(401)
  })

  it('does not grant an export delegation access to the retained legacy endpoint', async () => {
    const res = await app.request('/export', { headers: DELEGATED_H1 })
    expect(res.status).toBe(401)
  })

  it('reads one complete snapshot including archived rows, every relation, and local currency', async () => {
    const own = await seedCompleteSnapshot('Own')
    const transactionSpy = vi.spyOn(db, 'transaction')
    const readTransactionStates: boolean[] = []
    const prepare = sqlite.prepare.bind(sqlite)
    const prepareSpy = vi.spyOn(sqlite, 'prepare').mockImplementation(((source: string) => {
      if (/\bfrom\s+[`"]?(users|accounts|periods|categories|envelopes|envelope_budgets|transactions|goals|goal_contributions|debts)[`"]?/i.test(source)) {
        readTransactionStates.push(sqlite.inTransaction)
      }
      return prepare(source)
    }) as typeof sqlite.prepare)

    let res: Response
    try {
      res = await app.request('/exports/me', { headers: H1 })
    } finally {
      prepareSpy.mockRestore()
    }
    expect(res.status).toBe(200)
    const { data } = await res.json() as any

    expect(transactionSpy).toHaveBeenCalledTimes(1)
    expect(readTransactionStates.length).toBeGreaterThanOrEqual(10)
    expect(readTransactionStates.every(Boolean)).toBe(true)
    expect(data.currency).toBe('EUR')
    expect(data.accounts.map((row: any) => row.id).sort()).toEqual(
      [own.account.id, own.transferAccount.id].sort(),
    )
    expect(data.accounts.find((row: any) => row.id === own.transferAccount.id)?.archived).toBe(true)
    expect(data.periods.map((row: any) => row.id)).toEqual([own.period.id])
    expect(data.categories.map((row: any) => row.id)).toEqual([own.category.id])
    expect(data.envelopes.map((row: any) => row.id)).toEqual([own.envelope.id])
    expect(data.envelopes[0]).toMatchObject({
      archived: true,
      categoryId: own.category.id,
    })
    expect(data.envelopeBudgets.map((row: any) => row.id)).toEqual([own.budget.id])
    expect(data.envelopeBudgets[0]).toMatchObject({
      envelopeId: own.envelope.id,
      periodId: own.period.id,
    })
    expect(data.transactions.map((row: any) => row.id).sort()).toEqual(
      [own.transaction.id, own.transfer.id].sort(),
    )
    expect(data.transactions.find((row: any) => row.id === own.transaction.id)).toMatchObject({
      accountId: own.account.id,
      envelopeId: own.envelope.id,
    })
    expect(data.transactions.find((row: any) => row.id === own.transfer.id)?.toAccountId).toBe(own.transferAccount.id)
    expect(data.goals.map((row: any) => row.id)).toEqual([own.goal.id])
    expect(data.goals[0].archived).toBe(true)
    expect(data.goalContributions.map((row: any) => row.id)).toEqual([own.contribution.id])
    expect(data.goalContributions[0]).toMatchObject({
      goalId: own.goal.id,
      accountId: own.account.id,
    })
    expect(data.debts.map((row: any) => row.id)).toEqual([own.debt.id])
  })

  it('never includes another user or any relation owned through their rows', async () => {
    const own = await seedCompleteSnapshot('Own')
    const other = await seedCompleteSnapshot('Other', JSON_H2)

    const res = await app.request('/exports/me', { headers: H1 })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const serialized = JSON.stringify(body)

    expect(serialized).toContain(own.account.id)
    for (const foreignId of Object.values(other).map((row: any) => row.id)) {
      expect(serialized).not.toContain(foreignId)
    }
    expect(body.data.currency).toBe('EUR')
  })
})
