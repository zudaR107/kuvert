import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from '../../db/schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')

// Run migration from the single SQL file
const migrationSql = readFileSync(
  resolve(__dirname, '../../db/migrations/0000_smart_anita_blake.sql'),
  'utf-8',
)
for (const stmt of migrationSql.split('--> statement-breakpoint')) {
  const s = stmt.trim()
  if (s) sqlite.exec(s)
}

// Insert the two test users — they persist for the lifetime of this DB instance.
// Do NOT delete users in beforeEach cleanup.
const now = Date.now()
sqlite.prepare(
  'INSERT INTO users (id, email, name, currency, created_at) VALUES (?, ?, ?, ?, ?)',
).run('user-1', 'test@example.com', 'Test User', 'RUB', now)
sqlite.prepare(
  'INSERT INTO users (id, email, name, currency, created_at) VALUES (?, ?, ?, ?, ?)',
).run('user-2', 'test2@example.com', 'Test User 2', 'RUB', now)

export const db = drizzle(sqlite, { schema })

/**
 * Delete all data rows (not users) between tests.
 * Order respects FK constraints: delete dependents before parents.
 */
export function cleanDb() {
  const tables = [
    'goal_contributions',
    'envelope_budgets',
    'transactions',
    'goals',
    'debts',
    'accounts',
    'envelopes',
    'categories',
    'periods',
  ]
  for (const t of tables) sqlite.exec(`DELETE FROM ${t}`)

  // Reset mutable fields on the seeded users back to their defaults, since
  // the users table itself is intentionally not wiped above.
  sqlite.exec(`UPDATE users SET currency = 'RUB'`)
}
