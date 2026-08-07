import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  users, accounts, periods, categories, envelopes, envelopeBudgets, transactions, goals, goalContributions, debts,
} from '../../db/schema.js'
import { requireAuth } from '../../middleware/auth.js'

const router = new Hono()
router.use('*', requireAuth)

const timestampSchema = z.string().datetime()
const accountExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(),
  type: z.enum(['checking', 'cash', 'credit', 'savings']), currency: z.string(),
  initialBalance: z.number().int(), color: z.string(), archived: z.boolean(), createdAt: timestampSchema,
})
const periodExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), startDate: z.string(), endDate: z.string(), createdAt: timestampSchema,
})
const categoryExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), color: z.string(), sortOrder: z.number().int(),
})
const envelopeExportSchema = z.object({
  id: z.string(), userId: z.string(), categoryId: z.string().nullable(), name: z.string(), icon: z.string(),
  color: z.string(), rolloverEnabled: z.boolean(), archived: z.boolean(), sortOrder: z.number().int(), createdAt: timestampSchema,
})
const envelopeBudgetExportSchema = z.object({
  id: z.string(), envelopeId: z.string(), periodId: z.string(), allocated: z.number().int(), carriedOver: z.number().int(),
})
const transactionExportSchema = z.object({
  id: z.string(), userId: z.string(), accountId: z.string(), envelopeId: z.string().nullable(),
  toAccountId: z.string().nullable(), type: z.enum(['income', 'expense', 'transfer']), amount: z.number().int(),
  date: z.string(), note: z.string().nullable(), importId: z.string().nullable(), createdAt: timestampSchema,
})
const goalExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), icon: z.string(), color: z.string(),
  targetAmount: z.number().int(), currentAmount: z.number().int(), deadline: z.string().nullable(),
  recurring: z.boolean(), recurringDay: z.number().int().nullable(), archived: z.boolean(), createdAt: timestampSchema,
})
const contributionExportSchema = z.object({
  id: z.string(), goalId: z.string(), accountId: z.string(), amount: z.number().int(),
  date: z.string(), note: z.string().nullable(), createdAt: timestampSchema,
})
const debtExportSchema = z.object({
  id: z.string(), userId: z.string(), counterparty: z.string(), type: z.enum(['owed', 'owing']),
  amount: z.number().int(), currency: z.string(), dueDate: z.string().nullable(), note: z.string().nullable(),
  settled: z.boolean(), createdAt: timestampSchema,
})

export const exportResponseSchema = z.object({
  exportedAt: timestampSchema,
  scope: z.literal('kuvert-account-only'),
  currency: z.string().length(3),
  accounts: z.array(accountExportSchema),
  periods: z.array(periodExportSchema),
  categories: z.array(categoryExportSchema),
  envelopes: z.array(envelopeExportSchema),
  envelopeBudgets: z.array(envelopeBudgetExportSchema),
  transactions: z.array(transactionExportSchema),
  goals: z.array(goalExportSchema),
  goalContributions: z.array(contributionExportSchema),
  debts: z.array(debtExportSchema),
})

// Exports everything this account owns in kuvert - the counterpart to
// schlussel's own GET /auth/export, which only covers schlussel's own
// account data (profile, sessions). schlussel's account page calls both
// (plus tafel's and zettel's own /export) and merges them into one
// download, using the same shared access token across every service.
router.get('/', async (c) => {
  const user = c.get('user')

  const [
    localUser, accountRows, periodRows, categoryRows, envelopeRows, transactionRows, goalRows, debtRows,
  ] = await Promise.all([
    db.select({ currency: users.currency }).from(users).where(eq(users.id, user.id)).get(),
    db.select().from(accounts).where(eq(accounts.userId, user.id)),
    db.select().from(periods).where(eq(periods.userId, user.id)),
    db.select().from(categories).where(eq(categories.userId, user.id)),
    db.select().from(envelopes).where(eq(envelopes.userId, user.id)),
    db.select().from(transactions).where(eq(transactions.userId, user.id)),
    db.select().from(goals).where(eq(goals.userId, user.id)),
    db.select().from(debts).where(eq(debts.userId, user.id)),
  ])

  // Join tables with no userId column of their own - scoped to this
  // user's own envelopes/goals instead.
  const budgetRows = envelopeRows.length === 0 ? [] : await db.select({
    id: envelopeBudgets.id, envelopeId: envelopeBudgets.envelopeId, periodId: envelopeBudgets.periodId,
    allocated: envelopeBudgets.allocated, carriedOver: envelopeBudgets.carriedOver,
  }).from(envelopeBudgets).innerJoin(envelopes, eq(envelopes.id, envelopeBudgets.envelopeId)).where(eq(envelopes.userId, user.id))

  const contributionRows = goalRows.length === 0 ? [] : await db.select({
    id: goalContributions.id, goalId: goalContributions.goalId, accountId: goalContributions.accountId,
    amount: goalContributions.amount, date: goalContributions.date, note: goalContributions.note,
    createdAt: goalContributions.createdAt,
  }).from(goalContributions).innerJoin(goals, eq(goals.id, goalContributions.goalId)).where(eq(goals.userId, user.id))

  return c.json({
    exportedAt: new Date().toISOString(),
    scope: 'kuvert-account-only',
    currency: localUser!.currency,
    accounts: accountRows,
    periods: periodRows,
    categories: categoryRows,
    envelopes: envelopeRows,
    envelopeBudgets: budgetRows,
    transactions: transactionRows,
    goals: goalRows,
    goalContributions: contributionRows,
    debts: debtRows,
  })
})

export { router as exportRouter }
