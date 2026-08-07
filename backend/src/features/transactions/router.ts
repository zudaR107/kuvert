import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, or, gte, lte } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../../db/index.js'
import { transactions, accounts, envelopes } from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'
import { parseCsv } from '../../utils/csv.js'
import { isoDateSchema, isIsoCalendarDate } from '../../utils/date.js'

const router = new Hono()
router.use('*', requireAuth)

export const txSchema = z.object({
  accountId: z.string(),
  envelopeId: z.string().nullable().default(null),
  toAccountId: z.string().nullable().default(null),
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().int().positive(),
  date: isoDateSchema,
  note: z.string().max(500).nullable().default(null),
})

export const txUpdateSchema = z.object({
  accountId: z.string().optional(),
  envelopeId: z.string().nullable().optional(),
  toAccountId: z.string().nullable().optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  amount: z.number().int().positive().optional(),
  date: isoDateSchema.optional(),
  note: z.string().max(500).nullable().optional(),
})

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  accountId: z.string().optional(),
  envelopeId: z.string().optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: 'from must be before or equal to to',
  path: ['to'],
})

router.get('/', zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user')
  const { limit, offset, accountId, envelopeId, type, from, to } = c.req.valid('query')

  const rows = await db.select().from(transactions)
    .where(and(
      eq(transactions.userId, user.id),
      accountId ? or(
        eq(transactions.accountId, accountId),
        and(eq(transactions.type, 'transfer'), eq(transactions.toAccountId, accountId)),
      ) : undefined,
      envelopeId ? eq(transactions.envelopeId, envelopeId) : undefined,
      type ? eq(transactions.type, type) : undefined,
      from ? gte(transactions.date, from) : undefined,
      to ? lte(transactions.date, to) : undefined,
    ))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit)
    .offset(offset)

  return c.json(rows)
})

// Verifies every referenced id (account, envelope, transfer destination
// account) actually belongs to the calling user, not just that it exists -
// a foreign key alone only guarantees the row is real, not that it's
// theirs. Returns the matching error response to short-circuit with, or
// null if every reference given checks out.
async function checkReferencedOwnership(
  userId: string,
  data: { accountId?: string; envelopeId?: string | null; toAccountId?: string | null },
): Promise<Response | null> {
  if (data.accountId) {
    const account = await db.select().from(accounts)
      .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, userId))).get()
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 })
  }
  if (data.envelopeId) {
    const envelope = await db.select().from(envelopes)
      .where(and(eq(envelopes.id, data.envelopeId), eq(envelopes.userId, userId))).get()
    if (!envelope) return Response.json({ error: 'Envelope not found' }, { status: 404 })
  }
  if (data.toAccountId) {
    const toAccount = await db.select().from(accounts)
      .where(and(eq(accounts.id, data.toAccountId), eq(accounts.userId, userId))).get()
    if (!toAccount) return Response.json({ error: 'Destination account not found' }, { status: 404 })
  }
  return null
}

function checkTransactionCombination(data: {
  type: string
  accountId: string
  envelopeId: string | null
  toAccountId: string | null
}): Response | null {
  if (data.type === 'transfer') {
    if (!data.toAccountId) {
      return Response.json({ error: 'Destination account is required for transfers' }, { status: 400 })
    }
    if (data.accountId === data.toAccountId) {
      return Response.json({ error: 'Transfer accounts must be distinct' }, { status: 400 })
    }
    if (data.envelopeId) {
      return Response.json({ error: 'Transfers cannot be assigned to an envelope' }, { status: 400 })
    }
  } else if (data.toAccountId) {
    return Response.json({ error: 'Destination account is only valid for transfers' }, { status: 400 })
  }
  return null
}

async function checkTransferCurrency(
  userId: string,
  data: { type: string; accountId: string; toAccountId: string | null },
): Promise<Response | null> {
  if (data.type !== 'transfer' || !data.toAccountId) return null
  const rows = await db.select({ id: accounts.id, currency: accounts.currency }).from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      or(eq(accounts.id, data.accountId), eq(accounts.id, data.toAccountId)),
    ))
  const currencyById = new Map(rows.map((account) => [account.id, account.currency]))
  if (currencyById.get(data.accountId) !== currencyById.get(data.toAccountId)) {
    return Response.json({ error: 'Transfer accounts must use the same currency' }, { status: 400 })
  }
  return null
}

router.post('/', zValidator('json', txSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')

  const combinationError = checkTransactionCombination(data)
  if (combinationError) return combinationError
  const ownershipError = await checkReferencedOwnership(user.id, data)
  if (ownershipError) return ownershipError
  const currencyError = await checkTransferCurrency(user.id, data)
  if (currencyError) return currencyError

  const tx = { id: createId(), userId: user.id, ...data, importId: null, createdAt: new Date() }
  await db.insert(transactions).values(tx)
  return c.json(tx, 201)
})

// POST /transactions/import — universal CSV import.
//
// Expects a header row with at least `date` (a real YYYY-MM-DD calendar
// date), `amount` (a fully parsed, finite positive decimal in major units)
// and `type` (income|expense) columns;
// an optional `note` column and an optional `envelope` column (matched
// by name, case-insensitively, against the user's existing envelopes —
// unrecognized names are left unlinked rather than auto-creating new
// envelopes). Column order doesn't matter. All imported rows attach to
// a single account chosen up front, matching how a bank's CSV export is
// normally scoped to one account; transfers aren't representable in
// this format and are rejected per-row rather than guessed at. Structurally
// malformed quote grammar rejects the whole file before insertion; otherwise
// valid rows are inserted and invalid rows are returned with CSV row numbers.
//
// No deduplication against existing transactions yet - re-importing an
// overlapping date range will create duplicates. Formats/columns can be
// revisited once real export files need to be matched.
export const importSchema = z.object({
  accountId: z.string(),
  csv: z.string().min(1),
})

router.post('/import', zValidator('json', importSchema), async (c) => {
  const user = c.get('user')
  const { accountId, csv } = c.req.valid('json')

  const account = await db.select().from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id))).get()
  if (!account) return c.json({ error: 'Account not found' }, 404)

  let rows: string[][]
  try {
    rows = parseCsv(csv)
  } catch {
    return c.json({ error: 'Invalid CSV quote grammar' }, 400)
  }
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

    if (!isIsoCalendarDate(date)) {
      errors.push({ row: i + 1, error: `Invalid date: "${date}"` })
      continue
    }
    if (type !== 'income' && type !== 'expense') {
      errors.push({ row: i + 1, error: `Invalid type: "${type}" (must be income or expense)` })
      continue
    }
    if (note && note.length > 500) {
      errors.push({ row: i + 1, error: 'Note must be at most 500 characters' })
      continue
    }
    const amountMajor = /^\d+(?:\.\d+)?$/.test(amountStr) ? Number(amountStr) : NaN
    const amount = Math.round(amountMajor * 100)
    if (!Number.isFinite(amountMajor) || !Number.isSafeInteger(amount) || amount <= 0) {
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
      amount,
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

router.put('/:id', zValidator('json', txUpdateSchema), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const data = c.req.valid('json')
  const existing = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, user.id))).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const normalizedData = { ...data }
  if (data.type && data.type !== existing.type) {
    if (data.type === 'transfer') normalizedData.envelopeId = null
    else normalizedData.toAccountId = null
  }
  const updated = { ...existing, ...normalizedData }
  const combinationError = checkTransactionCombination(updated)
  if (combinationError) return combinationError
  const ownershipError = await checkReferencedOwnership(user.id, updated)
  if (ownershipError) return ownershipError
  const currencyError = await checkTransferCurrency(user.id, updated)
  if (currencyError) return currencyError

  await db.update(transactions).set(normalizedData).where(eq(transactions.id, id))
  return c.json(updated)
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
