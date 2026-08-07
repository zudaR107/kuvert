import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

export const updateSchema = z.object({
  currency: z.string().length(3),
})

// requireAuth auto-provisions the local user row on every authenticated
// request, so by the time these handlers run the row is guaranteed to
// exist - no "not found" branch needed.
// weekStart/dateFormat/timezone come straight off the already-verified
// JWT (schlussel embeds them, schloss-server-kit's AuthUser exposes
// them) - not this service's own `users` row, which only tracks id/
// email/name/currency. Passed through here so the frontend can read
// them from the same /users/me call it already makes, rather than a
// second request.
router.get('/me', async (c) => {
  const authUser = c.get('user')
  const row = await db.select().from(users).where(eq(users.id, authUser.id)).get()
  return c.json({
    id: row!.id, email: row!.email, name: row!.name, currency: row!.currency,
    weekStart: authUser.weekStart, dateFormat: authUser.dateFormat, timezone: authUser.timezone,
  })
})

router.put('/me', zValidator('json', updateSchema), async (c) => {
  const authUser = c.get('user')
  const { currency } = c.req.valid('json')
  await db.update(users).set({ currency }).where(eq(users.id, authUser.id))
  const row = await db.select().from(users).where(eq(users.id, authUser.id)).get()
  return c.json({
    id: row!.id, email: row!.email, name: row!.name, currency: row!.currency,
    weekStart: authUser.weekStart, dateFormat: authUser.dateFormat, timezone: authUser.timezone,
  })
})

export { router as usersRouter }
