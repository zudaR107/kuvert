import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, or } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { accounts, transactions } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

export const accountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'cash', 'credit', 'savings']).default('checking'),
  currency: z.string().length(3).default('RUB'),
  initialBalance: z.number().int().default(0),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#3b82f6'),
})

export const accountUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['checking', 'cash', 'credit', 'savings']).optional(),
  currency: z.string().length(3).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})

router.get('/', async (c) => {
  const user = c.get('user')
  const archived = c.req.query('archived') === 'true'
  const rows = await db.select().from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.archived, archived)))
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
  db.transaction((tx) => {
    tx.insert(accounts).values(account).run()

    // Opening money must become part of the budget in the same commit as
    // its account, so neither row can survive without the other.
    if (data.initialBalance !== 0) {
      tx.insert(transactions).values({
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
      }).run()
    }
  })

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

router.put('/:id', zValidator('json', accountUpdateSchema), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')

  const existing = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  if (data.currency && data.currency !== existing.currency) {
    const linkedTransfer = await db.select({ id: transactions.id }).from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        eq(transactions.type, 'transfer'),
        or(eq(transactions.accountId, id), eq(transactions.toAccountId, id)),
      )).get()
    if (linkedTransfer) {
      return c.json({ error: 'Account currency cannot be changed while linked to a transfer' }, 409)
    }
  }

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

router.post('/:id/restore', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const existing = await db.select().from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.update(accounts).set({ archived: false }).where(eq(accounts.id, id))
  return c.json({ ...existing, archived: false })
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

  const txs = await db.select().from(transactions)
    .where(and(
      eq(transactions.userId, user.id),
      or(
        eq(transactions.accountId, id),
        and(eq(transactions.type, 'transfer'), eq(transactions.toAccountId, id)),
      ),
    ))
  const txBalance = txs.reduce((sum, t) => {
    if (t.type === 'transfer' && t.toAccountId === id) return sum + t.amount
    if (t.accountId !== id) return sum
    if (t.type === 'income') return sum + t.amount
    if (t.type === 'expense' || t.type === 'transfer') return sum - t.amount
    return sum
  }, 0)

  return c.json({ balance: txBalance })
})

export { router as accountsRouter }
