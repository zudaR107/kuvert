import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { openApiDocument } from '../openapi.js'

// Purely descriptive generation - checks the document GET /openapi.json
// serves is well-formed and actually covers the routes it documents, not
// that any individual route's runtime behavior matches (that's covered by
// each feature's own test file).
describe('openApiDocument', () => {
  it('is a valid OpenAPI 3.0 document with the expected metadata', () => {
    expect(openApiDocument.openapi).toBe('3.0.0')
    expect(openApiDocument.info.title).toBe('Kuvert API')
  })

  it('registers a bearer auth security scheme', () => {
    expect(openApiDocument.components?.securitySchemes?.['bearerAuth']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('documents every feature area', () => {
    const paths = Object.keys(openApiDocument.paths ?? {})
    for (const path of [
      '/accounts', '/accounts/{id}', '/accounts/{id}/restore', '/accounts/{id}/balance',
      '/periods', '/periods/{id}', '/periods/{id}/budget', '/periods/{id}/budget/{envelopeId}',
      '/envelopes', '/envelopes/{id}', '/envelopes/categories', '/envelopes/categories/{id}',
      '/transactions', '/transactions/{id}', '/transactions/import',
      '/goals', '/goals/{id}', '/goals/{id}/contribute', '/goals/{id}/contributions',
      '/debts', '/debts/{id}',
      '/users/me',
    ]) {
      expect(paths).toContain(path)
    }
  })

  it('marks every documented operation as requiring bearer auth', () => {
    for (const [, item] of Object.entries(openApiDocument.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'delete'] as const) {
        const operation = item[method]
        if (operation) expect(operation.security).toEqual([{ bearerAuth: [] }])
      }
    }
  })
})

// ── GET /openapi.json endpoint ──────────────────────────────────────
//
// The spec for this endpoint: no/garbage auth -> 401, a valid bearer token
// for a non-admin user -> 403, a valid bearer token for an admin -> 200 with
// the OpenAPI document.
//
// The real route wiring (requireAuth + the admin-role gate) lives in
// src/index.ts, which this suite's other test files never import directly -
// they all reconstruct routing locally via helpers/setup.ts's
// createTestApp() instead. Confirmed empirically (not by reading index.ts's
// source) that importing it here would not be safe either: index.ts
// eagerly re-runs drizzle's `migrate()` at module load, which throws
// against the already-migrated in-memory db that helpers/db.ts sets up
// ("table already exists") - and, as the production entrypoint, it also
// presumably starts a real HTTP listener as a side effect. There's also no
// existing JWKS/JWT-signing helper anywhere in this suite (every other test
// file mocks `../middleware/auth.js` wholesale via helpers/auth-mock.ts
// rather than exercising real JWT verification), so a real-JWT approach
// isn't available either.
//
// So, per the fallback in this task's own spec, this reconstructs the
// endpoint's documented *contract* locally: a mock `requireAuth` (same
// `createMiddleware` shape as helpers/auth-mock.ts) parametrized by role via
// the bearer token, gating a route that serves the real `openApiDocument`.
// This exercises the real generated document but not index.ts's own
// role-check code path - flagged here so a bug in that inline logic
// wouldn't be caught by this file.
const requireAuth = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = auth.slice(7)
  if (token === 'admin-token') {
    c.set('user', { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' as const })
  } else if (token === 'user-token') {
    c.set('user', { id: 'user-1', email: 'user@example.com', name: 'User', role: 'user' as const })
  } else {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

function buildOpenApiJsonApp() {
  const app = new Hono()
  app.get('/openapi.json', requireAuth, (c) => {
    const user = c.get('user') as { role: 'admin' | 'user' }
    if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    return c.json(openApiDocument)
  })
  return app
}

describe('GET /openapi.json', () => {
  const app = buildOpenApiJsonApp()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no Authorization header is present', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(401)
  })

  it('returns 401 for a garbage/invalid bearer token', async () => {
    const res = await app.request('/openapi.json', {
      headers: { Authorization: 'Bearer not-a-real-token' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 for a valid token belonging to a non-admin user', async () => {
    const res = await app.request('/openapi.json', {
      headers: { Authorization: 'Bearer user-token' },
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 with a well-formed OpenAPI document for a valid admin token', async () => {
    const res = await app.request('/openapi.json', {
      headers: { Authorization: 'Bearer admin-token' },
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { openapi?: unknown; paths?: unknown }
    expect(typeof body.openapi).toBe('string')
    expect(body.openapi).toMatch(/^\d+\.\d+\.\d+$/)
    expect(typeof body.paths).toBe('object')
    expect(body.paths).not.toBeNull()
    expect(Object.keys(body.paths as Record<string, unknown>).length).toBeGreaterThan(0)
  })
})
