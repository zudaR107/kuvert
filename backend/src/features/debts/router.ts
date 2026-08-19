import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { randomUUID } from 'node:crypto'
import { db } from '../../db/index.js'
import { debts, notificationOutbox } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'
import { isoDateSchema } from '../../utils/date.js'

const router = new Hono()
router.use('*', requireAuth)

// Inserted in the same db.transaction() as the settled flip (see the PUT
// route below) - mirrors goals/router.ts's insertGoalCompletionEvent, so
// the event can never drift out of sync with the domain change that
// caused it.
function insertDebtSettledEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  counterparty: string,
): void {
  const id = randomUUID()
  const now = Date.now()
  tx.insert(notificationOutbox).values({
    id,
    eventType: 'kuvert.debt.paid_off.v1',
    userId,
    payload: JSON.stringify({ recipientId: userId, counterparty }),
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

export const debtSchema = z.object({
  counterparty: z.string().min(1).max(100),
  type: z.enum(['owed', 'owing']),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('RUB'),
  dueDate: isoDateSchema.nullable().default(null),
  note: z.string().max(500).nullable().default(null),
})

export const debtUpdateSchema = z.object({
  counterparty: z.string().min(1).max(100).optional(),
  type: z.enum(['owed', 'owing']).optional(),
  amount: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  dueDate: isoDateSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  settled: z.boolean().optional(),
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

router.put('/:id', zValidator('json', debtUpdateSchema), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')

  const updated = db.transaction((tx) => {
    const existing = tx.select().from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, user.id))).get()
    if (!existing) return null

    tx.update(debts).set(data).where(eq(debts.id, id)).run()
    if (!existing.settled && data.settled === true) {
      insertDebtSettledEvent(tx, user.id, data.counterparty ?? existing.counterparty)
    }
    return { ...existing, ...data }
  })

  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
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
