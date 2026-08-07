import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { randomUUID } from 'node:crypto'
import { db } from '../../db/index.js'
import { goals, goalContributions, accounts, notificationOutbox } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'
import { isoDateSchema } from '../../utils/date.js'

function isGoalComplete(currentAmount: number, targetAmount: number): boolean {
  return currentAmount >= targetAmount
}

// Inserted in the same db.transaction() as the domain change that
// completed the goal (see the contribute and update routes below) - if
// this insert fails, the whole transaction (including the domain change
// itself) rolls back with it, so the two can never drift out of sync.
function insertGoalCompletionEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  goalName: string,
): void {
  const id = randomUUID()
  const now = Date.now()
  tx.insert(notificationOutbox).values({
    id,
    eventType: 'kuvert.goal.completed.v1',
    userId,
    payload: JSON.stringify({ recipientId: userId, goalName }),
    correlationId: id,
    state: 'pending',
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    leaseId: null,
    leaseUntil: null,
    deliveredAt: null,
    lastError: null,
  }).run()
}

const router = new Hono()
router.use('*', requireAuth)

export const goalSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(50).default('target'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#10b981'),
  targetAmount: z.number().int().positive(),
  deadline: isoDateSchema.nullable().default(null),
  recurring: z.boolean().default(false),
  recurringDay: z.number().int().min(1).max(28).nullable().default(null),
})

export const goalUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  targetAmount: z.number().int().positive().optional(),
  deadline: isoDateSchema.nullable().optional(),
  recurring: z.boolean().optional(),
  recurringDay: z.number().int().min(1).max(28).nullable().optional(),
})

export const contributionSchema = z.object({
  accountId: z.string(),
  amount: z.number().int().positive(),
  date: isoDateSchema,
  note: z.string().max(500).nullable().default(null),
})

// Recurring goals are regenerated lazily, on the next time the goal list
// is read - no cron/scheduler for a self-hosted single-service app. A
// completed recurring goal is archived and replaced by a fresh cycle
// (same name/icon/color/target/recurrence, currentAmount reset to 0).
//
// recurringDay gates the earliest day of the month a new cycle may start
// (e.g. to line up with a payday) - null means no such constraint, so the
// new cycle starts as soon as the old one is complete.
async function regenerateCompletedGoals(userId: string): Promise<void> {
  const candidates = await db.select().from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.archived, false), eq(goals.recurring, true)))

  const now = new Date()
  const today = now.getDate()

  for (const goal of candidates) {
    if (goal.currentAmount < goal.targetAmount) continue
    if (goal.recurringDay !== null && today < goal.recurringDay) continue

    await db.update(goals).set({ archived: true }).where(eq(goals.id, goal.id))

    let newDeadline: string | null = null
    if (goal.deadline) {
      const cycleDurationMs = new Date(goal.deadline).getTime() - goal.createdAt.getTime()
      newDeadline = new Date(now.getTime() + cycleDurationMs).toISOString().slice(0, 10)
    }

    await db.insert(goals).values({
      id: createId(),
      userId,
      name: goal.name,
      icon: goal.icon,
      color: goal.color,
      targetAmount: goal.targetAmount,
      currentAmount: 0,
      deadline: newDeadline,
      recurring: goal.recurring,
      recurringDay: goal.recurringDay,
      archived: false,
      createdAt: now,
    })
  }
}

router.get('/', async (c) => {
  const user = c.get('user')
  await regenerateCompletedGoals(user.id)

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

router.put('/:id', zValidator('json', goalUpdateSchema), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const newTargetAmount = data.targetAmount ?? existing.targetAmount
  const wasComplete = isGoalComplete(existing.currentAmount, existing.targetAmount)
  const nowComplete = isGoalComplete(existing.currentAmount, newTargetAmount)

  try {
    db.transaction((tx) => {
      tx.update(goals).set(data).where(eq(goals.id, id)).run()
      if (!existing.archived && !wasComplete && nowComplete) {
        insertGoalCompletionEvent(tx, user.id, data.name ?? existing.name)
      }
    })
  } catch {
    return c.json({ error: 'Failed to update goal' }, 500)
  }

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

  const account = await db.select().from(accounts)
    .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, user.id))).get()
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const contribution = {
    id: createId(),
    goalId,
    ...data,
    createdAt: new Date(),
  }

  const newAmount = Math.min(goal.currentAmount + data.amount, goal.targetAmount)
  const wasComplete = isGoalComplete(goal.currentAmount, goal.targetAmount)
  const nowComplete = isGoalComplete(newAmount, goal.targetAmount)

  try {
    db.transaction((tx) => {
      tx.insert(goalContributions).values(contribution).run()
      tx.update(goals).set({ currentAmount: newAmount }).where(eq(goals.id, goalId)).run()
      if (!goal.archived && !wasComplete && nowComplete) {
        insertGoalCompletionEvent(tx, user.id, goal.name)
      }
    })
  } catch {
    return c.json({ error: 'Failed to record contribution' }, 500)
  }

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
