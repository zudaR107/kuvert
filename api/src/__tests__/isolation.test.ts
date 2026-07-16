/**
 * User isolation tests.
 * Verifies that user-2 cannot read, update, or delete resources owned by user-1.
 */
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
  post: (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: JSON_H1, body: JSON.stringify(body) }),
  put: (path: string, body: unknown) =>
    app.request(path, { method: 'PUT', headers: JSON_H1, body: JSON.stringify(body) }),
  del: (path: string) => app.request(path, { method: 'DELETE', headers: H1 }),
}

const asUser2 = {
  get: (path: string) => app.request(path, { headers: H2 }),
  post: (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: JSON_H2, body: JSON.stringify(body) }),
  put: (path: string, body: unknown) =>
    app.request(path, { method: 'PUT', headers: JSON_H2, body: JSON.stringify(body) }),
  del: (path: string) => app.request(path, { method: 'DELETE', headers: H2 }),
}

beforeEach(() => cleanDb())

// ── Accounts ───────────────────────────────────────────────────────
describe('Account isolation', () => {
  it('user-2 sees empty account list even when user-1 has accounts', async () => {
    await asUser1.post('/accounts', { name: 'Secret Account' })
    const list = await (await asUser2.get('/accounts')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot get balance of user-1 account', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    expect((await asUser2.get(`/accounts/${acct.id}/balance`)).status).toBe(404)
  })

  it('user-2 cannot update user-1 account', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    expect((await asUser2.put(`/accounts/${acct.id}`, { name: 'Hijacked' })).status).toBe(404)
  })

  it('user-2 cannot delete user-1 account', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    expect((await asUser2.del(`/accounts/${acct.id}`)).status).toBe(404)
  })

  it('user-2 cannot restore user-1 archived account', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    await asUser1.del(`/accounts/${acct.id}`)
    const res = await app.request(`/accounts/${acct.id}/restore`, { method: 'POST', headers: H2 })
    expect(res.status).toBe(404)
  })

  it('user-2 sees no accounts in ?archived=true even when user-1 has archived accounts', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    await asUser1.del(`/accounts/${acct.id}`)
    const list = await (await asUser2.get('/accounts?archived=true')).json() as any[]
    expect(list).toHaveLength(0)
  })
})

// ── Periods ────────────────────────────────────────────────────────
describe('Period isolation', () => {
  it('user-2 sees empty period list', async () => {
    await asUser1.post('/periods', { name: 'July', startDate: '2026-07-01', endDate: '2026-07-31' })
    const list = await (await asUser2.get('/periods')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot get user-1 period by id', async () => {
    const p = await (await asUser1.post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    expect((await asUser2.get(`/periods/${p.id}`)).status).toBe(404)
  })

  it('user-2 cannot delete user-1 period', async () => {
    const p = await (await asUser1.post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    expect((await asUser2.del(`/periods/${p.id}`)).status).toBe(404)
  })

  it('user-2 cannot access budget of user-1 period', async () => {
    const p = await (await asUser1.post('/periods', { name: 'P', startDate: '2026-07-01', endDate: '2026-07-31' })).json() as any
    expect((await asUser2.get(`/periods/${p.id}/budget`)).status).toBe(404)
  })
})

// ── Envelopes ──────────────────────────────────────────────────────
describe('Envelope isolation', () => {
  it('user-2 sees empty envelope list', async () => {
    await asUser1.post('/envelopes', { name: 'Food' })
    const list = await (await asUser2.get('/envelopes')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot update user-1 envelope', async () => {
    const env = await (await asUser1.post('/envelopes', { name: 'Food' })).json() as any
    expect((await asUser2.put(`/envelopes/${env.id}`, { name: 'Hijacked' })).status).toBe(404)
  })

  it('user-2 cannot delete user-1 envelope', async () => {
    const env = await (await asUser1.post('/envelopes', { name: 'Food' })).json() as any
    expect((await asUser2.del(`/envelopes/${env.id}`)).status).toBe(404)
  })

  it('user-2 cannot restore user-1 archived envelope', async () => {
    const env = await (await asUser1.post('/envelopes', { name: 'Food' })).json() as any
    await asUser1.del(`/envelopes/${env.id}`)
    const res = await app.request(`/envelopes/${env.id}/restore`, { method: 'POST', headers: H2 })
    expect(res.status).toBe(404)
  })

  it('user-2 sees no envelopes in ?archived=true even when user-1 has archived envelopes', async () => {
    const env = await (await asUser1.post('/envelopes', { name: 'Food' })).json() as any
    await asUser1.del(`/envelopes/${env.id}`)
    const list = await (await asUser2.get('/envelopes?archived=true')).json() as any[]
    expect(list).toHaveLength(0)
  })
})

// ── Goals ──────────────────────────────────────────────────────────
describe('Goal isolation', () => {
  it('user-2 sees empty goal list', async () => {
    await asUser1.post('/goals', { name: 'Car', targetAmount: 100000 })
    const list = await (await asUser2.get('/goals')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot update user-1 goal', async () => {
    const g = await (await asUser1.post('/goals', { name: 'Car', targetAmount: 100000 })).json() as any
    expect((await asUser2.put(`/goals/${g.id}`, { name: 'Hijacked' })).status).toBe(404)
  })

  it('user-2 cannot delete user-1 goal', async () => {
    const g = await (await asUser1.post('/goals', { name: 'Car', targetAmount: 100000 })).json() as any
    expect((await asUser2.del(`/goals/${g.id}`)).status).toBe(404)
  })

  it('user-2 cannot contribute to user-1 goal', async () => {
    const g = await (await asUser1.post('/goals', { name: 'Car', targetAmount: 100000 })).json() as any
    const acct = await (await asUser2.post('/accounts', { name: 'Acct' })).json() as any
    const res = await asUser2.post(`/goals/${g.id}/contribute`, { accountId: acct.id, amount: 100, date: '2026-07-01' })
    expect(res.status).toBe(404)
  })

  it('user-2 cannot list contributions for user-1 goal', async () => {
    const g = await (await asUser1.post('/goals', { name: 'Car', targetAmount: 100000 })).json() as any
    expect((await asUser2.get(`/goals/${g.id}/contributions`)).status).toBe(404)
  })
})

// ── Debts ──────────────────────────────────────────────────────────
describe('Debt isolation', () => {
  it('user-2 sees empty debt list', async () => {
    await asUser1.post('/debts', { counterparty: 'Alice', type: 'owed', amount: 5000 })
    const list = await (await asUser2.get('/debts')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot update user-1 debt', async () => {
    const d = await (await asUser1.post('/debts', { counterparty: 'Alice', type: 'owed', amount: 5000 })).json() as any
    expect((await asUser2.put(`/debts/${d.id}`, { amount: 1 })).status).toBe(404)
  })

  it('user-2 cannot delete user-1 debt', async () => {
    const d = await (await asUser1.post('/debts', { counterparty: 'Alice', type: 'owed', amount: 5000 })).json() as any
    expect((await asUser2.del(`/debts/${d.id}`)).status).toBe(404)
  })
})

// ── Transactions ───────────────────────────────────────────────────
describe('Transaction isolation', () => {
  it('user-2 sees empty transaction list', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    await asUser1.post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })
    const list = await (await asUser2.get('/transactions')).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('user-2 cannot update user-1 transaction', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    const tx = await (await asUser1.post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })).json() as any
    expect((await asUser2.put(`/transactions/${tx.id}`, { amount: 1 })).status).toBe(404)
  })

  it('user-2 cannot delete user-1 transaction', async () => {
    const acct = await (await asUser1.post('/accounts', { name: 'A' })).json() as any
    const tx = await (await asUser1.post('/transactions', { accountId: acct.id, type: 'income', amount: 100, date: '2026-07-01' })).json() as any
    expect((await asUser2.del(`/transactions/${tx.id}`)).status).toBe(404)
  })
})
