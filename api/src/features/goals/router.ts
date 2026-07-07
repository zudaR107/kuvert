import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { goals, goalContributions } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const goalSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(50).default('target'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#10b981'),
  targetAmount: z.number().int().positive(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  recurring: z.boolean().default(false),
  recurringDay: z.number().int().min(1).max(28).nullable().default(null),
})

const contributionSchema = z.object({
  accountId: z.string(),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).nullable().default(null),
})

router.get('/', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(goals)
    .where(and(eq(goals.userId, user.id), eq(goals.archived, false)))

  // Attach monthly contribution estimate
  const enriched = rows.map((g) => {
    let monthlyNeeded: number | null = null
    if (g.deadline) {
      const now = new Date()
      const deadline = new Date(g.deadline)
      const monthsLeft = Math.max(1,
        (deadline.getFullYear() - now.getFullYear()) * 12 +
        (deadline.getMonth() - now.getMonth())
      )
      monthlyNeeded = Math.ceil((g.targetAmount - g.currentAmount) / monthsLeft)
    }
    return { ...g, monthlyNeeded }
  })

  return c.json(enriched)
})

router.post('/', zValidator('json', goalSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const goal = {
    id: createId(),
    userId: user.id,
    ...data,
    currentAmount: 0,
    archived: false,
    createdAt: new Date(),
  }
  await db.insert(goals).values(goal)
  return c.json(goal, 201)
})

router.put('/:id', zValidator('json', goalSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(goals).set(data).where(eq(goals.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await db.select().from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.update(goals).set({ archived: true }).where(eq(goals.id, id))
  return c.json({ ok: true })
})

// POST /goals/:id/contribute
router.post('/:id/contribute', zValidator('json', contributionSchema), async (c) => {
  const user = c.get('user')
  const { id: goalId } = c.req.param()
  const data = c.req.valid('json')

  const goal = await db.select().from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, user.id))).get()
  if (!goal) return c.json({ error: 'Not found' }, 404)

  const contribution = {
    id: createId(),
    goalId,
    ...data,
    createdAt: new Date(),
  }
  await db.insert(goalContributions).values(contribution)

  const newAmount = Math.min(goal.currentAmount + data.amount, goal.targetAmount)
  await db.update(goals).set({ currentAmount: newAmount }).where(eq(goals.id, goalId))

  return c.json({ contribution, currentAmount: newAmount }, 201)
})

router.get('/:id/contributions', async (c) => {
  const user = c.get('user')
  const { id: goalId } = c.req.param()
  const goal = await db.select().from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, user.id))).get()
  if (!goal) return c.json({ error: 'Not found' }, 404)
  return c.json(await db.select().from(goalContributions).where(eq(goalContributions.goalId, goalId)))
})

export { router as goalsRouter }
