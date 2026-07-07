import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { debts } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const debtSchema = z.object({
  counterparty: z.string().min(1).max(100),
  type: z.enum(['owed', 'owing']),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('RUB'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
})

router.get('/', async (c) => {
  const user = c.get('user')
  const settled = c.req.query('settled') === 'true'
  const rows = await db.select().from(debts).where(eq(debts.userId, user.id))
  return c.json(rows.filter((d) => d.settled === settled))
})

router.post('/', zValidator('json', debtSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const debt = { id: createId(), userId: user.id, ...data, settled: false, createdAt: new Date() }
  await db.insert(debts).values(debt)
  return c.json(debt, 201)
})

router.put('/:id', zValidator('json', debtSchema.partial().extend({ settled: z.boolean().optional() })), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(debts).set(data).where(eq(debts.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(debts).where(eq(debts.id, id))
  return c.json({ ok: true })
})

export { router as debtsRouter }
