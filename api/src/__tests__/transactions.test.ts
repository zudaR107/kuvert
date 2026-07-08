import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

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
