import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { accounts, transactions } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const accountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'cash', 'credit', 'savings']).default('checking'),
  currency: z.string().length(3).default('RUB'),
  initialBalance: z.number().int().default(0),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#3b82f6'),
})

router.get('/', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.archived, false)))
  return c.json(rows)
})

router.post('/', zValidator('json', accountSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')
  const account = {
    id: createId(),
    userId: user.id,
    ...data,
    archived: false,
    createdAt: new Date(),
  }
  await db.insert(accounts).values(account)

  // A non-zero starting balance is otherwise invisible to budgeting -
  // toBeBudgeted only ever looks at the transactions table, never at
  // initialBalance directly. Recording it as a real opening transaction
  // makes the money immediately available to allocate, same as if the
  // user had entered it by hand. initialBalance itself is left as given
  // (still echoed back below) - see the /:id/balance formula, which no
  // longer adds it separately now that it's also one of these rows.
  if (data.initialBalance !== 0) {
    await db.insert(transactions).values({
      id: createId(),
      userId: user.id,
      accountId: account.id,
      envelopeId: null,
      toAccountId: null,
      type: data.initialBalance > 0 ? 'income' : 'expense',
      amount: Math.abs(data.initialBalance),
      date: new Date().toISOString().slice(0, 10),
      note: 'Начальный баланс',
      createdAt: new Date(),
    })
  }

  return c.json(account, 201)
})

router.get('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const account = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!account) return c.json({ error: 'Not found' }, 404)

  return c.json(account)
})

router.put('/:id', zValidator('json', accountSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')

  const existing = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.update(accounts).set(data).where(eq(accounts.id, id))
  return c.json({ ...existing, ...data })
})

router.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const existing = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // Soft delete
  await db.update(accounts).set({ archived: true }).where(eq(accounts.id, id))
  return c.json({ ok: true })
})

// Computed balance = sum of transactions (a non-zero initialBalance is
// itself recorded as an opening transaction at creation time - see
// POST / above - so it's already included here, not added again).
router.get('/:id/balance', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const account = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!account) return c.json({ error: 'Not found' }, 404)

  const txs = await db.select().from(transactions).where(eq(transactions.accountId, id))
  const txBalance = txs.reduce((sum, t) => {
    if (t.type === 'income') return sum + t.amount
    if (t.type === 'expense') return sum - t.amount
    // transfer out
    if (t.type === 'transfer' && t.toAccountId !== id) return sum - t.amount
    // transfer in
    if (t.type === 'transfer' && t.toAccountId === id) return sum + t.amount
    return sum
  }, 0)

  return c.json({ balance: txBalance })
})

export { router as accountsRouter }
