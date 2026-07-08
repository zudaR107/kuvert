import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const updateSchema = z.object({
  currency: z.string().length(3),
})

// requireAuth auto-provisions the local user row on every authenticated
// request, so by the time these handlers run the row is guaranteed to
// exist - no "not found" branch needed.
router.get('/me', async (c) => {
  const user = c.get('user')
  const row = await db.select().from(users).where(eq(users.id, user.id)).get()
  return c.json({ id: row!.id, email: row!.email, name: row!.name, currency: row!.currency })
})

router.put('/me', zValidator('json', updateSchema), async (c) => {
  const user = c.get('user')
  const { currency } = c.req.valid('json')
  await db.update(users).set({ currency }).where(eq(users.id, user.id))
  const row = await db.select().from(users).where(eq(users.id, user.id)).get()
  return c.json({ id: row!.id, email: row!.email, name: row!.name, currency: row!.currency })
})

export { router as usersRouter }
