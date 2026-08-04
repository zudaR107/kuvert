import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

// ── Mock the db and auth modules before any imports that use them ───
import { vi } from 'vitest'
vi.mock('../db/index.js', async () => await import('./helpers/db.js'))
vi.mock('../middleware/auth.js', async () => await import('./helpers/auth-mock.js'))

import { sqlite, cleanDb } from './helpers/db.js'
import { createTestApp } from './helpers/setup.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../db/migrations/0001_backfill_initial_balance_transactions.sql',
)

const app = createTestApp()

const H1 = { Authorization: 'Bearer test-token' }
const get = (path: string, headers = H1) => app.request(path, { headers })

beforeEach(() => cleanDb())

/**
 * Re-run the 0001 backfill migration's SQL directly against the raw sqlite
 * database. Needed because helpers/db.ts only runs every migration ONCE, at
 * module import time, against an empty database — before any test data
 * exists. Splitting on the same breakpoint marker drizzle-kit uses.
 */
function runBackfillMigration() {
  const migrationSql = readFileSync(migrationPath, 'utf-8')
  for (const stmt of migrationSql.split('--> statement-breakpoint')) {
    const s = stmt.trim()
    if (s) sqlite.exec(s)
  }
}

/**
 * Directly insert an "old-style" account — one that predates the
 * application change which makes POST /accounts auto-create a matching
 * opening transaction. Bypasses the API entirely, mirroring how
 * helpers/db.ts seeds the two test users via raw sqlite.
 */
function insertLegacyAccount(opts: { initialBalance: number; createdAtSeconds: number }) {
  const id = randomUUID()
  sqlite
    .prepare(
      `INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, color, archived, created_at)
       VALUES (?, 'user-1', 'Legacy Account', 'checking', 'RUB', ?, '#3b82f6', 0, ?)`,
    )
    .run(id, opts.initialBalance, opts.createdAtSeconds)
  return id
}

function insertTransaction(opts: {
  accountId: string
  type: 'income' | 'expense'
  amount: number
  date: string
}) {
  const id = randomUUID()
  sqlite
    .prepare(
      `INSERT INTO transactions (id, user_id, account_id, envelope_id, to_account_id, type, amount, date, note, import_id, created_at)
       VALUES (?, 'user-1', ?, NULL, NULL, ?, ?, ?, 'Existing', NULL, ?)`,
    )
    .run(id, opts.accountId, opts.type, opts.amount, opts.date, Math.floor(Date.now() / 1000))
  return id
}

// A fixed creation date for legacy accounts, expressed as unix epoch seconds
// (the storage format for the `created_at` integer/timestamp column) and as
// the YYYY-MM-DD string the migration should derive from it.
const CREATED_AT_DATE = '2020-06-15'
const CREATED_AT_SECONDS = Math.floor(Date.UTC(2020, 5, 15, 12, 0, 0) / 1000)

describe('0001_backfill_initial_balance_transactions migration', () => {
  it('backfills an income transaction for a positive initialBalance and zeroes it out', async () => {
    const accountId = insertLegacyAccount({
      initialBalance: 30000,
      createdAtSeconds: CREATED_AT_SECONDS,
    })

    runBackfillMigration()

    const txs = sqlite
      .prepare('SELECT * FROM transactions WHERE account_id = ?')
      .all(accountId) as any[]
    expect(txs).toHaveLength(1)
    expect(txs[0].type).toBe('income')
    expect(txs[0].amount).toBe(30000)
    expect(txs[0].date).toBe(CREATED_AT_DATE)
    expect(txs[0].account_id).toBe(accountId)

    const account = sqlite
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any
    expect(account.initial_balance).toBe(0)

    // Verify through the real API too, since balance is computed purely
    // from transactions.
    const res = await get(`/accounts/${accountId}/balance`)
    expect(res.status).toBe(200)
    expect((await res.json() as any).balance).toBe(30000)

    const list = await (await get(`/transactions?accountId=${accountId}`)).json() as any[]
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('income')
    expect(list[0].amount).toBe(30000)
    expect(list[0].date).toBe(CREATED_AT_DATE)
  })

  it('backfills an expense transaction for a negative initialBalance and zeroes it out', async () => {
    const accountId = insertLegacyAccount({
      initialBalance: -12000,
      createdAtSeconds: CREATED_AT_SECONDS,
    })

    runBackfillMigration()

    const txs = sqlite
      .prepare('SELECT * FROM transactions WHERE account_id = ?')
      .all(accountId) as any[]
    expect(txs).toHaveLength(1)
    expect(txs[0].type).toBe('expense')
    expect(txs[0].amount).toBe(12000)
    expect(txs[0].date).toBe(CREATED_AT_DATE)

    const account = sqlite
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any
    expect(account.initial_balance).toBe(0)

    const res = await get(`/accounts/${accountId}/balance`)
    expect(res.status).toBe(200)
    expect((await res.json() as any).balance).toBe(-12000)
  })

  it('leaves an account with initialBalance = 0 and no transactions untouched', async () => {
    const accountId = insertLegacyAccount({
      initialBalance: 0,
      createdAtSeconds: CREATED_AT_SECONDS,
    })

    runBackfillMigration()

    const txs = sqlite
      .prepare('SELECT * FROM transactions WHERE account_id = ?')
      .all(accountId) as any[]
    expect(txs).toHaveLength(0)

    const account = sqlite
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any
    expect(account.initial_balance).toBe(0)

    const res = await get(`/accounts/${accountId}/balance`)
    expect((await res.json() as any).balance).toBe(0)
  })

  it('leaves an already-migrated account (initialBalance = 0, has a transaction) untouched', async () => {
    const accountId = insertLegacyAccount({
      initialBalance: 0,
      createdAtSeconds: CREATED_AT_SECONDS,
    })
    const existingTxId = insertTransaction({
      accountId,
      type: 'income',
      amount: 7500,
      date: CREATED_AT_DATE,
    })

    runBackfillMigration()

    const txs = sqlite
      .prepare('SELECT * FROM transactions WHERE account_id = ?')
      .all(accountId) as any[]
    expect(txs).toHaveLength(1)
    expect(txs[0].id).toBe(existingTxId)
    expect(txs[0].amount).toBe(7500)
    expect(txs[0].note).toBe('Existing')

    const account = sqlite
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any
    expect(account.initial_balance).toBe(0)
  })

  it('is idempotent — running the migration a second time creates no duplicate transactions', async () => {
    const accountId = insertLegacyAccount({
      initialBalance: 45000,
      createdAtSeconds: CREATED_AT_SECONDS,
    })

    runBackfillMigration()
    runBackfillMigration()
    runBackfillMigration()

    const txs = sqlite
      .prepare('SELECT * FROM transactions WHERE account_id = ?')
      .all(accountId) as any[]
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(45000)

    const account = sqlite
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any
    expect(account.initial_balance).toBe(0)

    const res = await get(`/accounts/${accountId}/balance`)
    expect((await res.json() as any).balance).toBe(45000)
  })
})
