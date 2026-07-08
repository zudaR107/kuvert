import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { transactions, accounts, envelopes } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'
import { parseCsv } from '../../utils/csv.js'

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

// POST /transactions/import — universal CSV import.
//
// Expects a header row with at least `date` (YYYY-MM-DD), `amount`
// (positive decimal, major units) and `type` (income|expense) columns;
// an optional `note` column and an optional `envelope` column (matched
// by name, case-insensitively, against the user's existing envelopes —
// unrecognized names are left unlinked rather than auto-creating new
// envelopes). Column order doesn't matter. All imported rows attach to
// a single account chosen up front, matching how a bank's CSV export is
// normally scoped to one account; transfers aren't representable in
// this format and are rejected per-row rather than guessed at.
//
// No deduplication against existing transactions yet - re-importing an
// overlapping date range will create duplicates. Formats/columns can be
// revisited once real export files need to be matched.
const importSchema = z.object({
  accountId: z.string(),
  csv: z.string().min(1),
})

router.post('/import', zValidator('json', importSchema), async (c) => {
  const user = c.get('user')
  const { accountId, csv } = c.req.valid('json')

  const account = await db.select().from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id))).get()
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const rows = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'Empty CSV' }, 400)

  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const dateIdx = header.indexOf('date')
  const amountIdx = header.indexOf('amount')
  const typeIdx = header.indexOf('type')
  const noteIdx = header.indexOf('note')
  const envelopeIdx = header.indexOf('envelope')

  if (dateIdx === -1 || amountIdx === -1 || typeIdx === -1) {
    return c.json({ error: 'CSV must have date, amount, and type columns' }, 400)
  }

  const userEnvelopes = await db.select().from(envelopes).where(eq(envelopes.userId, user.id))
  const envelopeIdByName = new Map(userEnvelopes.map((e) => [e.name.toLowerCase(), e.id]))

  const importId = createId()
  const toInsert: (typeof transactions.$inferInsert)[] = []
  const errors: { row: number; error: string }[] = []

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i]!
    if (cols.length === 1 && cols[0] === '') continue // trailing blank line

    const date = (cols[dateIdx] ?? '').trim()
    const amountStr = (cols[amountIdx] ?? '').trim()
    const type = (cols[typeIdx] ?? '').trim().toLowerCase()
    const note = noteIdx >= 0 ? ((cols[noteIdx] ?? '').trim() || null) : null
    const envelopeName = envelopeIdx >= 0 ? (cols[envelopeIdx] ?? '').trim().toLowerCase() : ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ row: i + 1, error: `Invalid date: "${date}"` })
      continue
    }
    if (type !== 'income' && type !== 'expense') {
      errors.push({ row: i + 1, error: `Invalid type: "${type}" (must be income or expense)` })
      continue
    }
    const amountMajor = parseFloat(amountStr)
    if (isNaN(amountMajor) || amountMajor <= 0) {
      errors.push({ row: i + 1, error: `Invalid amount: "${amountStr}"` })
      continue
    }

    toInsert.push({
      id: createId(),
      userId: user.id,
      accountId,
      envelopeId: (envelopeName && envelopeIdByName.get(envelopeName)) || null,
      toAccountId: null,
      type,
      amount: Math.round(amountMajor * 100),
      date,
      note,
      importId,
      createdAt: new Date(),
    })
  }

  if (toInsert.length > 0) {
    await db.insert(transactions).values(toInsert)
  }

  return c.json({ importId, imported: toInsert.length, errors }, 201)
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
