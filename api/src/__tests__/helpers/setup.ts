import { Hono } from 'hono'
import { accountsRouter } from '../../features/accounts/router.js'
import { periodsRouter } from '../../features/periods/router.js'
import { envelopesRouter } from '../../features/envelopes/router.js'
import { transactionsRouter } from '../../features/transactions/router.js'
import { goalsRouter } from '../../features/goals/router.js'
import { debtsRouter } from '../../features/debts/router.js'
import { usersRouter } from '../../features/users/router.js'

/**
 * Build a minimal Hono app wired up with all feature routers.
 * The db and auth modules are expected to have been mocked by the calling
 * test file before this function is called.
 */
export function createTestApp() {
  const app = new Hono()
  app.get('/health', (c) => c.json({ status: 'ok', service: 'Kuvert' }))
  app.route('/accounts', accountsRouter)
  app.route('/periods', periodsRouter)
  app.route('/envelopes', envelopesRouter)
  app.route('/transactions', transactionsRouter)
  app.route('/goals', goalsRouter)
  app.route('/debts', debtsRouter)
  app.route('/users', usersRouter)
  return app
}
