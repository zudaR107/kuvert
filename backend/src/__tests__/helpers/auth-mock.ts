import { createMiddleware } from 'hono/factory'
import type { ExportPrincipal } from '@zudar107/schloss-server-kit'

const USERS = {
  'test-token': {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user' as const,
    weekStart: null,
    dateFormat: null,
    timezone: null,
  },
  'user2-token': {
    id: 'user-2',
    email: 'test2@example.com',
    name: 'Test User 2',
    role: 'user' as const,
    weekStart: null,
    dateFormat: null,
    timezone: null,
  },
}

/**
 * Mock auth middleware for tests.
 * "Bearer test-token"  → user-1
 * "Bearer user2-token" → user-2
 * anything else        → 401
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = auth.slice(7)
  const user = USERS[token as keyof typeof USERS]
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('user', user)
  await next()
})

/**
 * Export routes accept ordinary access tokens plus the exact delegated
 * principal represented here by aud=hof-service:kuvert, token_use=export,
 * scope containing data:export, and sub=user-1.
 */
export const requireExportAuth = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = auth.slice(7)
  const delegated = token === 'kuvert-export-delegation-token'
  const user = delegated ? USERS['test-token'] : USERS[token as keyof typeof USERS]
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const principal: ExportPrincipal = delegated
    ? { sub: user.id, kind: 'delegation', jobId: 'test-export-job' }
    : { sub: user.id, kind: 'access' }
  c.set('exportPrincipal', principal)
  await next()
})
