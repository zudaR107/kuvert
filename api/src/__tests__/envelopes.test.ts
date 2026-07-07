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

// ── Categories (mounted at /envelopes/categories) ──────────────────
describe('GET /envelopes/categories', () => {
  it('returns empty array initially', async () => {
    const res = await get('/envelopes/categories')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /envelopes/categories', () => {
  it('creates a category and returns 201', async () => {
    const res = await post('/envelopes/categories', { name: 'Living' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('Living')
    expect(body.color).toBe('#6366f1') // default
    expect(body.sortOrder).toBe(0)
    expect(body.userId).toBe('user-1')
  })

  it('creates a category with all fields', async () => {
    const res = await post('/envelopes/categories', {
      name: 'Transport',
      color: '#ff0000',
      sortOrder: 5,
    })
    const body = await res.json() as any
    expect(body.color).toBe('#ff0000')
    expect(body.sortOrder).toBe(5)
  })

  it('returns 400 for missing name', async () => {
    const res = await post('/envelopes/categories', { color: '#ff0000' })
    expect(res.status).toBe(400)
  })
})

describe('PUT /envelopes/categories/:id', () => {
  it('updates a category', async () => {
    const cat = await (await post('/envelopes/categories', { name: 'Old' })).json() as any
    const res = await put(`/envelopes/categories/${cat.id}`, { name: 'New' })
    expect(res.status).toBe(200)
    expect((await res.json() as any).name).toBe('New')
  })

  it('returns 404 for unknown id', async () => {
    const res = await put('/envelopes/categories/nope', { name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /envelopes/categories/:id', () => {
  it('deletes a category and returns { ok: true }', async () => {
    const cat = await (await post('/envelopes/categories', { name: 'ToDelete' })).json() as any
    const res = await del(`/envelopes/categories/${cat.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/envelopes/categories/nope')).status).toBe(404)
  })
})

// ── Envelopes ──────────────────────────────────────────────────────
describe('GET /envelopes', () => {
  it('returns empty array initially', async () => {
    const res = await get('/envelopes')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns non-archived envelopes', async () => {
    await post('/envelopes', { name: 'Food' })
    await post('/envelopes', { name: 'Transport' })
    const list = await (await get('/envelopes')).json() as any[]
    expect(list).toHaveLength(2)
  })

  it('does not return archived envelopes', async () => {
    const env = await (await post('/envelopes', { name: 'Gone' })).json() as any
    await del(`/envelopes/${env.id}`)
    const list = await (await get('/envelopes')).json() as any[]
    expect(list.find((e: any) => e.id === env.id)).toBeUndefined()
  })
})

describe('POST /envelopes', () => {
  it('creates an envelope with defaults and returns 201', async () => {
    const res = await post('/envelopes', { name: 'Groceries' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('Groceries')
    expect(body.icon).toBe('wallet')
    expect(body.color).toBe('#3b82f6')
    expect(body.rolloverEnabled).toBe(true)
    expect(body.archived).toBe(false)
    expect(body.sortOrder).toBe(0)
    expect(body.userId).toBe('user-1')
  })

  it('creates envelope with categoryId', async () => {
    const cat = await (await post('/envelopes/categories', { name: 'Living' })).json() as any
    const env = await (await post('/envelopes', { name: 'Rent', categoryId: cat.id })).json() as any
    expect(env.categoryId).toBe(cat.id)
  })

  it('returns 400 for missing name', async () => {
    const res = await post('/envelopes', { icon: 'food' })
    expect(res.status).toBe(400)
  })
})

describe('PUT /envelopes/:id', () => {
  it('updates an envelope', async () => {
    const env = await (await post('/envelopes', { name: 'Old' })).json() as any
    const res = await put(`/envelopes/${env.id}`, { name: 'New', sortOrder: 3 })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.name).toBe('New')
    expect(body.sortOrder).toBe(3)
  })

  it('returns 404 for unknown id', async () => {
    const res = await put('/envelopes/nope', { name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /envelopes/:id', () => {
  it('soft-deletes envelope and returns { ok: true }', async () => {
    const env = await (await post('/envelopes', { name: 'ToDelete' })).json() as any
    const res = await del(`/envelopes/${env.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown id', async () => {
    expect((await del('/envelopes/nope')).status).toBe(404)
  })
})
