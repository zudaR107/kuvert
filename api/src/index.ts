import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db/index.js'
import { accountsRouter } from './features/accounts/router.js'
import { periodsRouter } from './features/periods/router.js'
import { envelopesRouter } from './features/envelopes/router.js'
import { transactionsRouter } from './features/transactions/router.js'
import { goalsRouter } from './features/goals/router.js'
import { debtsRouter } from './features/debts/router.js'
import { usersRouter } from './features/users/router.js'

// Resolved relative to this file so it works both in dev (src/index.ts,
// migrations at src/db/migrations) and in the compiled build
// (dist/index.js, migrations at dist/db/migrations) without a hardcoded
// path that only matches one of the two.
const __dirname = dirname(fileURLToPath(import.meta.url))

migrate(db, { migrationsFolder: join(__dirname, 'db/migrations') })

const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:5174')
  .split(',').map((o) => o.trim())

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400,
}))

app.get('/health', (c) => c.json({ status: 'ok', service: 'Kuvert' }))

app.route('/accounts', accountsRouter)
app.route('/periods', periodsRouter)
app.route('/envelopes', envelopesRouter)
app.route('/transactions', transactionsRouter)
app.route('/goals', goalsRouter)
app.route('/debts', debtsRouter)
app.route('/users', usersRouter)

const PORT = Number(process.env['PORT'] ?? 3001)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[Kuvert API] Running on http://localhost:${PORT}`)
})
