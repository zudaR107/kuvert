import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { periods, envelopes, envelopeBudgets, transactions } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const periodSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

router.get('/', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(periods)
    .where(eq(periods.userId, user.id))
    .orderBy(desc(periods.startDate))
  return c.json(rows)
})

router.post('/', zValidator('json', periodSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const period = { id: createId(), userId: user.id, ...data, createdAt: new Date() }
  await db.insert(periods).values(period)
  return c.json(period, 201)
})

router.get('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const period = await db.select().from(periods)
    .where(and(eq(periods.id, id), eq(periods.userId, user.id))).get()
  if (!period) return c.json({ error: 'Not found' }, 404)
  return c.json(period)
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const period = await db.select().from(periods)
    .where(and(eq(periods.id, id), eq(periods.userId, user.id))).get()
  if (!period) return c.json({ error: 'Not found' }, 404)
  await db.delete(periods).where(eq(periods.id, id))
  return c.json({ ok: true })
})

// GET /periods/:id/budget — envelopes with allocation + spent for this period
router.get('/:id/budget', async (c) => {
  const user = c.get('user')
  const { id: periodId } = c.req.param()

  const period = await db.select().from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.userId, user.id))).get()
  if (!period) return c.json({ error: 'Not found' }, 404)

  const allEnvelopes = await db.select().from(envelopes)
    .where(and(eq(envelopes.userId, user.id), eq(envelopes.archived, false)))

  const budgets = await db.select().from(envelopeBudgets)
    .where(eq(envelopeBudgets.periodId, periodId))

  const txs = await db.select().from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.type, 'expense')))

  const budgetMap = new Map(budgets.map((b) => [b.envelopeId, b]))

  const result = allEnvelopes.map((env) => {
    const budget = budgetMap.get(env.id)
    const spent = txs
      .filter((t) => t.envelopeId === env.id && t.date >= period.startDate && t.date <= period.endDate)
      .reduce((sum, t) => sum + t.amount, 0)
    const allocated = budget?.allocated ?? 0
    const carriedOver = budget?.carriedOver ?? 0
    return {
      envelope: env,
      allocated,
      carriedOver,
      available: allocated + carriedOver - spent,
      spent,
    }
  })

  // To Be Budgeted = total income in period - total allocated
  const income = txs
    .filter((t) => t.type !== 'expense')
  const totalIncome = (await db.select().from(transactions)
    .where(and(eq(transactions.userId, user.id), eq(transactions.type, 'income'))))
    .filter((t) => t.date >= period.startDate && t.date <= period.endDate)
    .reduce((sum, t) => sum + t.amount, 0)

  const totalAllocated = result.reduce((sum, r) => sum + r.allocated + r.carriedOver, 0)

  return c.json({ period, envelopes: result, toBeBudgeted: totalIncome - totalAllocated })
})

// PUT /periods/:id/budget/:envelopeId — set allocation
const allocationSchema = z.object({ allocated: z.number().int().min(0) })

router.put('/:id/budget/:envelopeId', zValidator('json', allocationSchema), async (c) => {
  const user = c.get('user')
  const { id: periodId, envelopeId } = c.req.param()
  const { allocated } = c.req.valid('json')

  const period = await db.select().from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.userId, user.id))).get()
  if (!period) return c.json({ error: 'Period not found' }, 404)

  const envelope = await db.select().from(envelopes)
    .where(and(eq(envelopes.id, envelopeId), eq(envelopes.userId, user.id))).get()
  if (!envelope) return c.json({ error: 'Envelope not found' }, 404)

  const existing = await db.select().from(envelopeBudgets)
    .where(and(eq(envelopeBudgets.periodId, periodId), eq(envelopeBudgets.envelopeId, envelopeId))).get()

  if (existing) {
    await db.update(envelopeBudgets).set({ allocated }).where(eq(envelopeBudgets.id, existing.id))
    return c.json({ ...existing, allocated })
  }

  const budget = { id: createId(), envelopeId, periodId, allocated, carriedOver: 0 }
  await db.insert(envelopeBudgets).values(budget)
  return c.json(budget, 201)
})

export { router as periodsRouter }
