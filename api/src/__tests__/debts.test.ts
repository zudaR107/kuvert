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

const DEBT_BODY = { counterparty: 'Alice', type: 'owed' as const, amount: 5000 }

describe('GET /debts', () => {
  it('returns empty array when no debts', async () => {
    const res = await get('/debts')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns only unsettled debts by default (no settled param)', async () => {
    await post('/debts', DEBT_BODY)
    const res = await get('/debts')
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0]!.settled).toBe(false)
  })

  it('returns only settled debts when ?settled=true', async () => {
    const debt = await (await post('/debts', DEBT_BODY)).json() as any
    await put(`/debts/${debt.id}`, { settled: true })

    // Default (unsettled) → empty
    const unsettled = await (await get('/debts')).json() as any[]
    expect(unsettled).toHaveLength(0)

    // settled=true → the debt appears
    const settled = await (await get('/debts?settled=true')).json() as any[]
    expect(settled).toHaveLength(1)
    expect(settled[0]!.id).toBe(debt.id)
  })
})

describe('POST /debts', () => {
  it('creates a debt and returns 201', async () => {
    const res = await post('/debts', {
      counterparty: 'Bob',
      type: 'owing',
      amount: 10000,
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.counterparty).toBe('Bob')
    expect(body.type).toBe('owing')
    expect(body.amount).toBe(10000)
    expect(body.currency).toBe('RUB') // default
    expect(body.settled).toBe(false)
    expect(body.userId).toBe('user-1')
  })

  it('creates a debt with all optional fields', async () => {
    const res = await post('/debts', {
      counterparty: 'Carol',
      type: 'owed',
      amount: 3000,
      currency: 'USD',
      dueDate: '2026-12-31',
      note: 'Borrowed at dinner',
    })
    const body = await res.json() as any
    expect(body.currency).toBe('USD')
    expect(body.dueDate).toBe('2026-12-31')
    expect(body.note).toBe('Borrowed at dinner')
  })

  it('returns 400 for missing required fields', async () => {
    const res = await post('/debts', { counterparty: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const res = await post('/debts', { counterparty: 'X', type: 'lent', amount: 100 })
    expect(res.status).toBe(400)
  })
})

describe('PUT /debts/:id', () => {
  it('updates a debt', async () => {
    const debt = await (await post('/debts', DEBT_BODY)).json() as any
    const res = await put(`/debts/${debt.id}`, { amount: 9000 })
    expect(res.status).toBe(200)
    expect((await res.json() as any).amount).toBe(9000)
  })

  it('can mark a debt as settled', async () => {
    const debt = await (await post('/debts', DEBT_BODY)).json() as any
    const res = await put(`/debts/${debt.id}`, { settled: true })
    expect(res.status).toBe(200)
    expect((await res.json() as any).settled).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    expect((await put('/debts/nope', { amount: 100 })).status).toBe(404)
  })
})

describe('DELETE /debts/:id', () => {
  it('deletes a debt and returns { ok: true }', async () => {
    const debt = await (await post('/debts', DEBT_BODY)).json() as any
    const res = await del(`/debts/${debt.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('deleted debt no longer appears in list', async () => {
    const debt = await (await post('/debts', DEBT_BODY)).json() as any
    await del(`/debts/${debt.id}`)
    const list = await (await get('/debts')).json() as any[]
    expect(list.find((d: any) => d.id === debt.id)).toBeUndefined()
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/debts/nope')).status).toBe(404)
  })
})
