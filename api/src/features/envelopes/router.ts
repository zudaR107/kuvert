import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { envelopes, categories } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const envelopeSchema = z.object({
  name: z.string().min(1).max(100),
  categoryId: z.string().nullable().default(null),
  icon: z.string().max(50).default('wallet'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#3b82f6'),
  rolloverEnabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#6366f1'),
  sortOrder: z.number().int().default(0),
})

// ── Categories ────────────────────────────────────────────────────
router.get('/categories', async (c) => {
  const user = c.get('user')
  return c.json(await db.select().from(categories).where(eq(categories.userId, user.id)))
})

router.post('/categories', zValidator('json', categorySchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const cat = { id: createId(), userId: user.id, ...data }
  await db.insert(categories).values(cat)
  return c.json(cat, 201)
})

router.put('/categories/:id', zValidator('json', categorySchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(categories).set(data).where(eq(categories.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/categories/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(categories).where(eq(categories.id, id))
  return c.json({ ok: true })
})

// ── Envelopes ──────────────────────────────────────────────────────
router.get('/', async (c) => {
  const user = c.get('user')
  const archived = c.req.query('archived') === 'true'
  return c.json(
    await db.select().from(envelopes)
      .where(and(eq(envelopes.userId, user.id), eq(envelopes.archived, archived)))
  )
})

router.post('/', zValidator('json', envelopeSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const envelope = { id: createId(), userId: user.id, ...data, archived: false, createdAt: new Date() }
  await db.insert(envelopes).values(envelope)
  return c.json(envelope, 201)
})

router.put('/:id', zValidator('json', envelopeSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(envelopes)
    .where(and(eq(envelopes.id, id), eq(envelopes.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(envelopes).set(data).where(eq(envelopes.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(envelopes)
    .where(and(eq(envelopes.id, id), eq(envelopes.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(envelopes).set({ archived: true }).where(eq(envelopes.id, id))
  return c.json({ ok: true })
})

router.post('/:id/restore', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(envelopes)
    .where(and(eq(envelopes.id, id), eq(envelopes.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(envelopes).set({ archived: false }).where(eq(envelopes.id, id))
  return c.json({ ...existing, archived: false })
})

export { router as envelopesRouter }
