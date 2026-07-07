import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { transactions } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const txSchema = z.object({
  accountId: z.string(),
  envelopeId: z.string().nullable().default(null),
  toAccountId: z.string().nullable().default(null),
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).nullable().default(null),
})

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  accountId: z.string().optional(),
  envelopeId: z.string().optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

router.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user')
  const { limit, offset, accountId, envelopeId, type, from, to } = c.req.valid('query')

  let rows = await db.select().from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .offset(offset)

  // In-memory filters for now (sufficient for personal use scale)
  if (accountId) rows = rows.filter((t) => t.accountId === accountId)
  if (envelopeId) rows = rows.filter((t) => t.envelopeId === envelopeId)
  if (type) rows = rows.filter((t) => t.type === type)
  if (from) rows = rows.filter((t) => t.date >= from)
  if (to) rows = rows.filter((t) => t.date <= to)

  return c.json(rows)
})

router.post('/', zValidator('json', txSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const tx = { id: createId(), userId: user.id, ...data, importId: null, createdAt: new Date() }
  await db.insert(transactions).values(tx)
  return c.json(tx, 201)
})

router.put('/:id', zValidator('json', txSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(transactions).set(data).where(eq(transactions.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(transactions).where(eq(transactions.id, id))
  return c.json({ ok: true })
})

export { router as transactionsRouter }
