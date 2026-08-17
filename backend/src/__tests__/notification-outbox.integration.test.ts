import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { cleanDb, sqlite } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const app = createTestApp()
const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations')
const AUTH_HEADERS = { Authorization: 'Bearer test-token' }
const JSON_HEADERS = { ...AUTH_HEADERS, 'Content-Type': 'application/json' }

interface OutboxRow {
  id: string
  event_type: string
  user_id: string
  payload: string
  correlation_id: string
  state: string
  created_at: number
  attempts: number
  next_attempt_at: number | null
  lease_id: string | null
  lease_until: number | null
  delivered_at: number | null
  permanent_at: number | null
  last_error: string | null
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

function put(path: string, body: unknown) {
  return app.request(path, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

async function createGoal(name = 'Emergency Fund', targetAmount = 1_000) {
  const response = await post('/goals', { name, targetAmount })
  expect(response.status).toBe(201)
  return await response.json() as { id: string; name: string; targetAmount: number }
}

async function createAccount() {
  const response = await post('/accounts', { name: 'Bank' })
  expect(response.status).toBe(201)
  return await response.json() as { id: string }
}

function hasOutboxTable(): boolean {
  return sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notification_outbox'",
  ).get() !== undefined
}

function outboxRows(): OutboxRow[] {
  const exists = hasOutboxTable()
  expect(exists, 'migration must create notification_outbox').toBe(true)
  if (!exists) return []
  return sqlite.prepare(
    'SELECT * FROM notification_outbox ORDER BY created_at, id',
  ).all() as OutboxRow[]
}

function goalState(goalId: string): { current_amount: number; target_amount: number } {
  return sqlite.prepare(
    'SELECT current_amount, target_amount FROM goals WHERE id = ?',
  ).get(goalId) as { current_amount: number; target_amount: number }
}

function contributionCount(goalId: string): number {
  const row = sqlite.prepare(
    'SELECT COUNT(*) AS count FROM goal_contributions WHERE goal_id = ?',
  ).get(goalId) as { count: number }
  return row.count
}

beforeEach(() => {
  cleanDb()
  sqlite.exec('DROP TRIGGER IF EXISTS fail_notification_outbox_insert')
})

afterEach(() => {
  sqlite.exec('DROP TRIGGER IF EXISTS fail_notification_outbox_insert')
  vi.unstubAllGlobals()
})

describe('notification_outbox migration', () => {
  it('creates the schema required by the shared generic dispatcher', () => {
    const exists = hasOutboxTable()
    expect(exists, 'migration must create notification_outbox').toBe(true)
    if (!exists) return

    const columns = sqlite.prepare('PRAGMA table_info(notification_outbox)').all() as Array<{
      name: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>
    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'event_type',
      'user_id',
      'payload',
      'correlation_id',
      'state',
      'created_at',
      'attempts',
      'next_attempt_at',
      'lease_id',
      'lease_until',
      'delivered_at',
      'last_error',
      'permanent_at',
    ])
    expect(columns.find((column) => column.name === 'id')).toMatchObject({ notnull: 1, pk: 1 })
    expect(columns.find((column) => column.name === 'state')?.dflt_value).toMatch(/pending/)
    expect(columns.find((column) => column.name === 'attempts')?.dflt_value).toBe('0')

    const indexes = sqlite.prepare('PRAGMA index_list(notification_outbox)').all() as Array<{ name: string }>
    expect(indexes.map((index) => index.name)).toContain('notification_outbox_dispatch_idx')
  })

  it('backfills terminal time for permanent rows created before permanent_at existed', () => {
    const legacyDb = new Database(':memory:')
    const runMigration = (name: string) => {
      for (const statement of readFileSync(resolve(migrationsDir, name), 'utf8').split('--> statement-breakpoint')) {
        if (statement.trim()) legacyDb.exec(statement)
      }
    }

    try {
      runMigration('0002_shocking_fenris.sql')
      legacyDb.prepare(`
        INSERT INTO notification_outbox
          (id, event_type, user_id, payload, correlation_id, state, created_at)
        VALUES (?, ?, ?, ?, ?, 'permanent', ?)
      `).run(crypto.randomUUID(), 'kuvert.test.v1', 'user-1', '{}', crypto.randomUUID(), 123_456)

      runMigration('0003_careful_paper_doll.sql')

      expect(legacyDb.prepare(
        "SELECT created_at, permanent_at FROM notification_outbox WHERE state = 'permanent'",
      ).get()).toEqual({ created_at: 123_456, permanent_at: 123_456 })
    } finally {
      legacyDb.close()
    }
  })
})

describe('goal completion notification outbox', () => {
  it('records exactly one strict versioned event when a contribution completes an active goal', async () => {
    const goal = await createGoal('New Laptop')
    const account = await createAccount()

    const response = await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 1_000,
      date: '2026-08-07',
    })

    expect(response.status).toBe(201)
    const rows = outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      event_type: 'kuvert.goal.completed.v1',
      user_id: 'user-1',
      state: 'pending',
      attempts: 0,
      lease_id: null,
      lease_until: null,
      delivered_at: null,
      last_error: null,
    })
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      recipientId: 'user-1',
      goalName: 'New Laptop',
    })
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(rows[0]!.correlation_id).toBe(rows[0]!.id)
    expect(rows[0]!.created_at).toBeGreaterThan(1_000_000_000_000)
    expect(rows[0]!.next_attempt_at).toBe(rows[0]!.created_at)
  })

  it('emits only on the first incomplete-to-complete contribution transition', async () => {
    const goal = await createGoal()
    const account = await createAccount()

    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 400,
      date: '2026-08-05',
    })
    expect(outboxRows()).toHaveLength(0)

    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 900,
      date: '2026-08-06',
    })
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 100,
      date: '2026-08-07',
    })

    expect(outboxRows()).toHaveLength(1)
  })

  it('serializes interleaved contributions without losing amount or duplicating completion', async () => {
    const goal = await createGoal()
    const account = await createAccount()

    const responses = await Promise.all([
      post(`/goals/${goal.id}/contribute`, {
        accountId: account.id,
        amount: 600,
        date: '2026-08-06',
      }),
      post(`/goals/${goal.id}/contribute`, {
        accountId: account.id,
        amount: 600,
        date: '2026-08-07',
      }),
    ])

    expect(responses.map((response) => response.status)).toEqual([201, 201])
    expect(goalState(goal.id)).toEqual({ current_amount: 1_000, target_amount: 1_000 })
    expect(contributionCount(goal.id)).toBe(2)
    expect(outboxRows()).toHaveLength(1)
  })

  it('records one event when lowering targetAmount completes an active goal', async () => {
    const goal = await createGoal('House Deposit')
    const account = await createAccount()
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 700,
      date: '2026-08-07',
    })
    expect(outboxRows()).toHaveLength(0)

    const response = await put(`/goals/${goal.id}`, { targetAmount: 700 })

    expect(response.status).toBe(200)
    const rows = outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      event_type: 'kuvert.goal.completed.v1',
      user_id: 'user-1',
      state: 'pending',
    })
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      recipientId: 'user-1',
      goalName: 'House Deposit',
    })
  })

  it('serializes interleaved target adjustments against the latest goal state', async () => {
    const goal = await createGoal()
    const account = await createAccount()
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 700,
      date: '2026-08-07',
    })

    const responses = await Promise.all([
      put(`/goals/${goal.id}`, { targetAmount: 700 }),
      put(`/goals/${goal.id}`, { targetAmount: 600 }),
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect([600, 700]).toContain(goalState(goal.id).target_amount)
    expect(outboxRows()).toHaveLength(1)
  })

  it('emits nothing for incomplete updates, no-op updates, archived goals, or already-complete goals', async () => {
    const goal = await createGoal()
    const account = await createAccount()
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 300,
      date: '2026-08-07',
    })

    await put(`/goals/${goal.id}`, { targetAmount: 900 })
    await put(`/goals/${goal.id}`, { name: 'Emergency Fund' })
    expect(outboxRows()).toHaveLength(0)

    await put(`/goals/${goal.id}`, { targetAmount: 300 })
    expect(outboxRows()).toHaveLength(1)

    await put(`/goals/${goal.id}`, { targetAmount: 200 })
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 100,
      date: '2026-08-08',
    })
    expect(outboxRows()).toHaveLength(1)

    const archived = await createGoal('Archived Goal', 500)
    await app.request(`/goals/${archived.id}`, { method: 'DELETE', headers: AUTH_HEADERS })
    await put(`/goals/${archived.id}`, { targetAmount: 1 })
    expect(outboxRows()).toHaveLength(1)
  })

  it('does not synchronously fetch while handling a completion request', async () => {
    const goal = await createGoal()
    const account = await createAccount()
    const fetchMock = vi.fn().mockRejectedValue(new Error('Glocke is unavailable'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 1_000,
      date: '2026-08-07',
    })

    expect(response.status).toBe(201)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(outboxRows()).toHaveLength(1)
  })

  it('rolls back contribution insert and goal amount when the outbox insert fails', async () => {
    const goal = await createGoal()
    const account = await createAccount()
    const exists = hasOutboxTable()
    expect(exists, 'migration must create notification_outbox').toBe(true)
    if (!exists) return
    sqlite.exec(`
      CREATE TRIGGER fail_notification_outbox_insert
      BEFORE INSERT ON notification_outbox
      BEGIN
        SELECT RAISE(ABORT, 'forced outbox failure');
      END
    `)

    const response = await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 1_000,
      date: '2026-08-07',
    })

    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(response.status).toBeLessThan(600)
    expect(goalState(goal.id)).toEqual({ current_amount: 0, target_amount: 1_000 })
    expect(contributionCount(goal.id)).toBe(0)
    expect(outboxRows()).toHaveLength(0)
  })

  it('rolls back targetAmount when its completion outbox insert fails', async () => {
    const goal = await createGoal()
    const account = await createAccount()
    await post(`/goals/${goal.id}/contribute`, {
      accountId: account.id,
      amount: 700,
      date: '2026-08-07',
    })
    const exists = hasOutboxTable()
    expect(exists, 'migration must create notification_outbox').toBe(true)
    if (!exists) return
    sqlite.exec(`
      CREATE TRIGGER fail_notification_outbox_insert
      BEFORE INSERT ON notification_outbox
      BEGIN
        SELECT RAISE(ABORT, 'forced outbox failure');
      END
    `)

    const response = await put(`/goals/${goal.id}`, { targetAmount: 700 })

    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(response.status).toBeLessThan(600)
    expect(goalState(goal.id)).toEqual({ current_amount: 700, target_amount: 1_000 })
    expect(contributionCount(goal.id)).toBe(1)
    expect(outboxRows()).toHaveLength(0)
  })
})
