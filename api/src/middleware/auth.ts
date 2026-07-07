import { createMiddleware } from 'hono/factory'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'

const JWKS_URL = process.env['SCHLUSSEL_JWKS_URL'] ?? 'http://localhost:4000/.well-known/jwks.json'
const ISSUER = process.env['JWT_ISSUER'] ?? 'schlussel'

const jwks = createRemoteJWKSet(new URL(JWKS_URL))

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { payload } = await jwtVerify(authHeader.slice(7), jwks, { issuer: ISSUER })

    const userId = payload.sub as string
    const email = payload['email'] as string
    const name = payload['name'] as string
    const role = payload['role'] as 'admin' | 'user'

    // Auto-provision user on first access
    const existing = await db.select().from(users).where(eq(users.id, userId)).get()
    if (!existing) {
      await db.insert(users).values({
        id: userId,
        email,
        name,
        currency: 'RUB',
        createdAt: new Date(),
      })
    }

    c.set('user', { id: userId, email, name, role })
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})
