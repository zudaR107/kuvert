import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb, db } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'
import { transactions } from '../db/schema.js'

const app = createTestApp()

const H1 = { Authorization: 'Bearer test-token' }
const JSON_H1 = { ...H1, 'Content-Type': 'application/json' }
const H2 = { Authorization: 'Bearer user2-token' }
const JSON_H2 = { ...H2, 'Content-Type': 'application/json' }

const get = (path: string) => app.request(path, { headers: H1 })
const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: JSON_H1, body: JSON.stringify(body) })
const put = (path: string, body: unknown) =>
  app.request(path, { method: 'PUT', headers: JSON_H1, body: JSON.stringify(body) })
const del = (path: string) => app.request(path, { method: 'DELETE', headers: H1 })
const post2 = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: JSON_H2, body: JSON.stringify(body) })

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

  it('rejects a transfer without a destination account', async () => {
    const from = await mkAccount('From')
    const res = await post('/transactions', {
      accountId: from.id,
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })
    expect(res.status).toBe(400)
  })

  it('rejects a transfer to an unknown destination account', async () => {
    const from = await mkAccount('From')
    const res = await post('/transactions', {
      accountId: from.id,
      toAccountId: 'missing-account',
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })
    expect(res.status).toBe(404)
  })

  it('rejects a transfer to an account owned by another user', async () => {
    const from = await mkAccount('From')
    const other = await (await post2('/accounts', { name: 'Other User Account' })).json() as any
    const res = await post('/transactions', {
      accountId: from.id,
      toAccountId: other.id,
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })
    expect(res.status).toBe(404)
  })

  it('rejects a transfer whose destination is its source account', async () => {
    const account = await mkAccount('Same Account')
    const res = await post('/transactions', {
      accountId: account.id,
      toAccountId: account.id,
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })
    expect(res.status).toBe(400)
  })

  it('rejects a transfer between accounts with different currencies', async () => {
    const rub = await (await post('/accounts', { name: 'Roubles', currency: 'RUB' })).json() as any
    const usd = await (await post('/accounts', { name: 'Dollars', currency: 'USD' })).json() as any

    const res = await post('/transactions', {
      accountId: rub.id,
      toAccountId: usd.id,
      type: 'transfer',
      amount: 2000,
      date: '2026-07-03',
    })

    expect(res.status).toBe(400)
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

  it('includes incoming transfers when filtering by the destination account', async () => {
    const source = await mkAccount('Source')
    const destination = await mkAccount('Destination')
    const transfer = await (await post('/transactions', {
      accountId: source.id,
      toAccountId: destination.id,
      type: 'transfer',
      amount: 2500,
      date: '2026-07-01',
    })).json() as any

    const body = await (await get(`/transactions?accountId=${destination.id}`)).json() as any[]
    expect(body.map((tx) => tx.id)).toContain(transfer.id)
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

  it('applies filters before limit and offset', async () => {
    const acct = await mkAccount()
    await post('/transactions', { accountId: acct.id, type: 'expense', amount: 100, date: '2026-07-05' })
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 200, date: '2026-07-04' })
    await post('/transactions', { accountId: acct.id, type: 'expense', amount: 300, date: '2026-07-03' })
    await post('/transactions', { accountId: acct.id, type: 'income', amount: 400, date: '2026-07-02' })
    await post('/transactions', { accountId: acct.id, type: 'expense', amount: 500, date: '2026-07-01' })

    const first = await (await get('/transactions?type=expense&limit=1')).json() as any[]
    expect(first.map((tx) => tx.amount)).toEqual([100])

    const second = await (await get('/transactions?type=expense&limit=1&offset=1')).json() as any[]
    expect(second.map((tx) => tx.amount)).toEqual([300])

    const third = await (await get('/transactions?type=expense&limit=1&offset=2')).json() as any[]
    expect(third.map((tx) => tx.amount)).toEqual([500])
  })

  it('uses a deterministic tie-breaker when date and creation time are equal', async () => {
    const acct = await mkAccount()
    const createdAt = new Date('2026-07-01T12:00:00.000Z')
    await db.insert(transactions).values([
      {
        id: 'same-time-a', userId: 'user-1', accountId: acct.id, envelopeId: null,
        toAccountId: null, type: 'income', amount: 100, date: '2026-07-01',
        note: null, importId: null, createdAt,
      },
      {
        id: 'same-time-b', userId: 'user-1', accountId: acct.id, envelopeId: null,
        toAccountId: null, type: 'income', amount: 200, date: '2026-07-01',
        note: null, importId: null, createdAt,
      },
    ])

    const body = await (await get('/transactions')).json() as any[]
    expect(body.map((tx) => tx.id)).toEqual(['same-time-b', 'same-time-a'])
  })

  it.each([
    '/transactions?from=July-01-2026',
    '/transactions?to=2026-7-31',
    '/transactions?from=2026-02-30',
    '/transactions?from=2026-08-01&to=2026-07-31',
  ])('rejects an invalid date filter range: %s', async (path) => {
    expect((await get(path)).status).toBe(400)
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

  it('rejects changing a non-transfer into a transfer without a destination', async () => {
    const acct = await mkAccount()
    const tx = await (await post('/transactions', {
      accountId: acct.id,
      type: 'expense',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    expect((await put(`/transactions/${tx.id}`, { type: 'transfer' })).status).toBe(400)
  })

  it('rejects a partial update that makes a transfer destination equal its source', async () => {
    const source = await mkAccount('Source')
    const destination = await mkAccount('Destination')
    const tx = await (await post('/transactions', {
      accountId: source.id,
      toAccountId: destination.id,
      type: 'transfer',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    expect((await put(`/transactions/${tx.id}`, { accountId: destination.id })).status).toBe(400)
  })

  it('rejects clearing the destination from an existing transfer', async () => {
    const source = await mkAccount('Source')
    const destination = await mkAccount('Destination')
    const tx = await (await post('/transactions', {
      accountId: source.id,
      toAccountId: destination.id,
      type: 'transfer',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    expect((await put(`/transactions/${tx.id}`, { toAccountId: null })).status).toBe(400)
  })

  it('clears toAccountId when changing a transfer to a non-transfer type', async () => {
    const source = await mkAccount('Source')
    const destination = await mkAccount('Destination')
    const tx = await (await post('/transactions', {
      accountId: source.id,
      toAccountId: destination.id,
      type: 'transfer',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    const updated = await (await put(`/transactions/${tx.id}`, { type: 'expense' })).json() as any
    expect(updated).toMatchObject({ type: 'expense', toAccountId: null })
    expect(await (await get('/transactions')).json()).toEqual([
      expect.objectContaining({ id: tx.id, type: 'expense', toAccountId: null }),
    ])
  })

  it('clears envelopeId when changing a transaction to a transfer', async () => {
    const source = await mkAccount('Source')
    const destination = await mkAccount('Destination')
    const envelope = await (await post('/envelopes', { name: 'Food' })).json() as any
    const tx = await (await post('/transactions', {
      accountId: source.id,
      envelopeId: envelope.id,
      type: 'expense',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    const updated = await (await put(`/transactions/${tx.id}`, {
      type: 'transfer',
      toAccountId: destination.id,
    })).json() as any
    expect(updated).toMatchObject({ type: 'transfer', envelopeId: null })
    expect(await (await get('/transactions')).json()).toEqual([
      expect.objectContaining({ id: tx.id, type: 'transfer', envelopeId: null }),
    ])
  })

  it('rejects updating a transfer to use a destination with a different currency', async () => {
    const source = await (await post('/accounts', { name: 'Source', currency: 'RUB' })).json() as any
    const rubDestination = await (await post('/accounts', { name: 'RUB destination', currency: 'RUB' })).json() as any
    const usdDestination = await (await post('/accounts', { name: 'USD destination', currency: 'USD' })).json() as any
    const tx = await (await post('/transactions', {
      accountId: source.id,
      toAccountId: rubDestination.id,
      type: 'transfer',
      amount: 100,
      date: '2026-07-01',
    })).json() as any

    expect((await put(`/transactions/${tx.id}`, { toAccountId: usdDestination.id })).status).toBe(400)
    expect(await (await get('/transactions')).json()).toEqual([
      expect.objectContaining({ id: tx.id, toAccountId: rubDestination.id }),
    ])
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

const importTx = (body: unknown) =>
  app.request('/transactions/import', { method: 'POST', headers: JSON_H1, body: JSON.stringify(body) })

describe('POST /transactions/import', () => {
  it('returns 404 when accountId does not exist', async () => {
    const res = await importTx({ accountId: 'nope', csv: 'date,amount,type\n2026-07-01,100.00,income\n' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when accountId belongs to another user', async () => {
    const other = await (await post2('/accounts', { name: 'Other Bank' })).json() as any
    const res = await importTx({ accountId: other.id, csv: 'date,amount,type\n2026-07-01,100.00,income\n' })
    expect(res.status).toBe(404)
  })

  it('returns 413 for a request body over the global size limit', async () => {
    const acct = await mkAccount()
    const hugeCsv = 'date,amount,type\n' + '2026-07-01,100.00,income\n'.repeat(300_000) // ~7.5MB
    const res = await importTx({ accountId: acct.id, csv: hugeCsv })
    expect(res.status).toBe(413)
  })

  it('returns 400 and imports nothing when the "type" column is missing', async () => {
    const acct = await mkAccount()
    const res = await importTx({ accountId: acct.id, csv: 'date,amount\n2026-07-01,100.00\n' })
    expect(res.status).toBe(400)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('returns 400 and imports nothing when the "date" column is missing', async () => {
    const acct = await mkAccount()
    const res = await importTx({ accountId: acct.id, csv: 'amount,type\n100.00,income\n' })
    expect(res.status).toBe(400)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('returns 400 and imports nothing when the "amount" column is missing', async () => {
    const acct = await mkAccount()
    const res = await importTx({ accountId: acct.id, csv: 'date,type\n2026-07-01,income\n' })
    expect(res.status).toBe(400)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(0)
  })

  it('accepts headers in any order and matches column names case-insensitively', async () => {
    const acct = await mkAccount()
    const csv = 'AMOUNT,Type,Date\n123.45,income,2026-07-01\n'
    const res = await importTx({ accountId: acct.id, csv })
    expect(res.status).toBe(201)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(1)
    expect(list[0]!.type).toBe('income')
    expect(list[0]!.date).toBe('2026-07-01')
  })

  it('converts a decimal major-unit amount to an integer minor-unit amount', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type\n2026-07-01,123.45,expense\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(1)
    expect(list[0]!.amount).toBe(12345)
  })

  it('sets accountId from the request body (not the CSV) and toAccountId to null', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type\n2026-07-01,10.00,income\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(1)
    expect(list[0]!.accountId).toBe(acct.id)
    expect(list[0]!.toAccountId).toBeNull()
  })

  it('stores the note column value on the transaction when present and non-empty', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type,note\n2026-07-01,10.00,income,Salary payment\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list[0]!.note).toBe('Salary payment')
  })

  it('sets note to null when the note column is present but empty for a row', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type,note\n2026-07-01,10.00,income,\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list[0]!.note).toBeNull()
  })

  it('sets note to null when the note column is absent entirely', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type\n2026-07-01,10.00,income\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list[0]!.note).toBeNull()
  })

  it('links a transaction to a matching envelope, case-insensitively, without creating a new one', async () => {
    const acct = await mkAccount()
    const env = await (await post('/envelopes', { name: 'Groceries' })).json() as any
    const csv = 'date,amount,type,envelope\n2026-07-01,10.00,expense,groceries\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list[0]!.envelopeId).toBe(env.id)

    const envelopesAfter = await (await get('/envelopes')).json() as any[]
    expect(envelopesAfter).toHaveLength(1)
  })

  it('leaves envelopeId null when the envelope value matches none of the user\'s envelopes', async () => {
    const acct = await mkAccount()
    await post('/envelopes', { name: 'Groceries' })
    const csv = 'date,amount,type,envelope\n2026-07-01,10.00,expense,Nonexistent Envelope\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list[0]!.envelopeId).toBeNull()

    const envelopesAfter = await (await get('/envelopes')).json() as any[]
    expect(envelopesAfter).toHaveLength(1)
  })

  it('leaves envelopeId null when the envelope column is absent or empty', async () => {
    const acct = await mkAccount()
    // Empty value for an existing "envelope" column:
    await importTx({ accountId: acct.id, csv: 'date,amount,type,envelope\n2026-07-01,10.00,expense,\n' })
    const withEmptyCol = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(withEmptyCol[0]!.envelopeId).toBeNull()

    const acct2 = await mkAccount('Bank2')
    await importTx({ accountId: acct2.id, csv: 'date,amount,type\n2026-07-03,10.00,expense\n' })
    const withoutCol = await (await get(`/transactions?accountId=${acct2.id}`)).json() as any[]
    expect(withoutCol[0]!.envelopeId).toBeNull()
  })

  it('only accepts "income" or "expense" as a valid type, case-insensitively, and rejects "transfer"', async () => {
    const acct = await mkAccount()
    const csv = [
      'date,amount,type',
      '2026-07-01,10.00,INCOME',
      '2026-07-02,10.00,Expense',
      '2026-07-03,10.00,transfer',
    ].join('\n') + '\n'
    const res = await importTx({ accountId: acct.id, csv })
    const body = await res.json() as any
    expect(body.imported).toBe(2)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(2)
    expect(list.every((t: any) => t.type === 'income' || t.type === 'expense')).toBe(true)
  })

  it('skips invalid rows (bad date, non-numeric amount, non-positive amount, bad type) but imports the valid ones, reporting failure details', async () => {
    const acct = await mkAccount()
    const csv = [
      'date,amount,type',
      '2026-07-01,100.00,income',   // valid
      'not-a-date,50.00,expense',   // invalid: bad date
      '2026-07-02,abc,expense',     // invalid: non-numeric amount
      '2026-07-03,-5.00,expense',   // invalid: non-positive amount
      '2026-07-04,10.00,transfer',  // invalid: unsupported type
      '2026-07-05,10.00,bogus',     // invalid: unknown type
      '2026-07-06,20.00,expense',   // valid
    ].join('\n') + '\n'
    const res = await importTx({ accountId: acct.id, csv })
    expect(res.status).toBe(201)
    const body = await res.json() as any

    expect(body.imported).toBe(2)
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.errors).toHaveLength(5)

    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(2)
    expect(list.some((t: any) => t.date === '2026-07-01')).toBe(true)
    expect(list.some((t: any) => t.date === '2026-07-06')).toBe(true)
  })

  it.each(['12.34 trailing', 'Infinity', '1e309'])(
    'rejects a non-finite or partially parsed amount: %s',
    async (amount) => {
      const acct = await mkAccount()
      const res = await importTx({
        accountId: acct.id,
        csv: `date,amount,type\n2026-07-01,${amount},income\n`,
      })

      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ imported: 0, errors: [expect.objectContaining({ row: 2 })] })
      expect(await (await get(`/transactions?accountId=${acct.id}`)).json()).toEqual([])
    },
  )

  it('rejects impossible calendar dates while accepting a real leap day', async () => {
    const acct = await mkAccount()
    const csv = [
      'date,amount,type',
      '2023-02-29,10.00,income',
      '2024-02-29,20.00,income',
      '2026-04-31,30.00,expense',
    ].join('\n') + '\n'

    const res = await importTx({ accountId: acct.id, csv })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ imported: 1, errors: [{ row: 2 }, { row: 4 }] })

    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list.map((tx) => tx.date)).toEqual(['2024-02-29'])
  })

  it('ignores a blank trailing line without treating it as an invalid row', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type\n2026-07-01,10.00,income\n2026-07-02,20.00,expense\n\n'
    const res = await importTx({ accountId: acct.id, csv })
    const body = await res.json() as any
    expect(body.imported).toBe(2)
    expect(body.errors ?? []).toHaveLength(0)
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(2)
  })

  it('parses quoted CSV fields containing commas as a single value', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type,note\n2026-07-01,10.00,expense,"Groceries, weekly"\n'
    await importTx({ accountId: acct.id, csv })
    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(1)
    expect(list[0]!.note).toBe('Groceries, weekly')
  })

  it('rejects an unterminated quoted field and imports nothing', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type,note\n2026-07-01,10.00,expense,"unterminated note\n'

    const res = await importTx({ accountId: acct.id, csv })

    expect(res.status).toBe(400)
    expect(await (await get(`/transactions?accountId=${acct.id}`)).json()).toEqual([])
  })

  it.each([
    'date,amount,type,note\n2026-07-01,10.00,expense,bad"quote\n',
    'date,amount,type,note\n2026-07-01,10.00,expense,"quoted"suffix\n',
  ])('rejects invalid quote grammar and imports nothing', async (csv) => {
    const acct = await mkAccount()

    const res = await importTx({ accountId: acct.id, csv })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid CSV quote grammar' })
    expect(await (await get(`/transactions?accountId=${acct.id}`)).json()).toEqual([])
  })

  it('accepts an imported note at the 500-character limit', async () => {
    const acct = await mkAccount()
    const note = 'n'.repeat(500)

    const res = await importTx({
      accountId: acct.id,
      csv: `date,amount,type,note\n2026-07-01,10.00,income,${note}\n`,
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ imported: 1, errors: [] })
    expect(await (await get(`/transactions?accountId=${acct.id}`)).json()).toEqual([
      expect.objectContaining({ note }),
    ])
  })

  it('reports and skips an imported note over 500 characters', async () => {
    const acct = await mkAccount()
    const note = 'n'.repeat(501)

    const res = await importTx({
      accountId: acct.id,
      csv: `date,amount,type,note\n2026-07-01,10.00,income,${note}\n`,
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      imported: 0,
      errors: [expect.objectContaining({ row: 2 })],
    })
    expect(await (await get(`/transactions?accountId=${acct.id}`)).json()).toEqual([])
  })

  it('assigns a single shared importId to all transactions from one call, and a different one on a subsequent call', async () => {
    const acct = await mkAccount()
    const csv1 = 'date,amount,type\n2026-07-01,10.00,income\n2026-07-02,20.00,expense\n'
    const res1 = await importTx({ accountId: acct.id, csv: csv1 })
    const body1 = await res1.json() as any
    expect(body1.importId).toBeTruthy()

    const list1 = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list1).toHaveLength(2)
    const importIds1 = new Set(list1.map((t: any) => t.importId))
    expect(importIds1.size).toBe(1)
    expect(importIds1.has(body1.importId)).toBe(true)

    const csv2 = 'date,amount,type\n2026-07-03,30.00,income\n'
    const res2 = await importTx({ accountId: acct.id, csv: csv2 })
    const body2 = await res2.json() as any
    expect(body2.importId).toBeTruthy()
    expect(body2.importId).not.toBe(body1.importId)

    const listAll = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    const newTx = listAll.find((t: any) => t.date === '2026-07-03')
    expect(newTx.importId).toBe(body2.importId)
    expect(newTx.importId).not.toBe(body1.importId)
  })

  it('imports a transaction that shows up in GET /transactions and can be edited and deleted like any other', async () => {
    const acct = await mkAccount()
    const csv = 'date,amount,type\n2026-07-01,15.00,expense\n'
    await importTx({ accountId: acct.id, csv })

    const list = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(list).toHaveLength(1)
    const tx = list[0]!

    const putRes = await put(`/transactions/${tx.id}`, { amount: 999 })
    expect(putRes.status).toBe(200)
    expect((await putRes.json() as any).amount).toBe(999)

    const delRes = await del(`/transactions/${tx.id}`)
    expect(delRes.status).toBe(200)
    expect(await delRes.json()).toEqual({ ok: true })

    const listAfter = await (await get(`/transactions?accountId=${acct.id}`)).json() as any[]
    expect(listAfter).toHaveLength(0)
  })
})
