import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { exportEnvelopeSchema } from '@zudar107/schloss-server-kit'
import type { ExportAuthEnv } from '@zudar107/schloss-server-kit'
import { db } from '../../db/index.js'
import {
  users, accounts, periods, categories, envelopes, envelopeBudgets, transactions, goals, goalContributions, debts,
} from '../../db/schema.js'
import { requireAuth, requireExportAuth } from '../../middleware/auth.js'

const timestampSchema = z.string().datetime()
const accountExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(),
  type: z.enum(['checking', 'cash', 'credit', 'savings']), currency: z.string(),
  initialBalance: z.number().int(), color: z.string(), archived: z.boolean(), createdAt: timestampSchema,
}).strict()
const periodExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), startDate: z.string(), endDate: z.string(), createdAt: timestampSchema,
}).strict()
const categoryExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), color: z.string(), sortOrder: z.number().int(),
}).strict()
const envelopeExportSchema = z.object({
  id: z.string(), userId: z.string(), categoryId: z.string().nullable(), name: z.string(), icon: z.string(),
  color: z.string(), rolloverEnabled: z.boolean(), archived: z.boolean(), sortOrder: z.number().int(), createdAt: timestampSchema,
}).strict()
const envelopeBudgetExportSchema = z.object({
  id: z.string(), envelopeId: z.string(), periodId: z.string(), allocated: z.number().int(), carriedOver: z.number().int(),
}).strict()
const transactionExportSchema = z.object({
  id: z.string(), userId: z.string(), accountId: z.string(), envelopeId: z.string().nullable(),
  toAccountId: z.string().nullable(), type: z.enum(['income', 'expense', 'transfer']), amount: z.number().int(),
  date: z.string(), note: z.string().nullable(), importId: z.string().nullable(), createdAt: timestampSchema,
}).strict()
const goalExportSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), icon: z.string(), color: z.string(),
  targetAmount: z.number().int(), currentAmount: z.number().int(), deadline: z.string().nullable(),
  recurring: z.boolean(), recurringDay: z.number().int().nullable(), archived: z.boolean(), createdAt: timestampSchema,
}).strict()
const contributionExportSchema = z.object({
  id: z.string(), goalId: z.string(), accountId: z.string(), amount: z.number().int(),
  date: z.string(), note: z.string().nullable(), createdAt: timestampSchema,
}).strict()
const debtExportSchema = z.object({
  id: z.string(), userId: z.string(), counterparty: z.string(), type: z.enum(['owed', 'owing']),
  amount: z.number().int(), currency: z.string(), dueDate: z.string().nullable(), note: z.string().nullable(),
  settled: z.boolean(), createdAt: timestampSchema,
}).strict()

export const exportDataSchema = z.object({
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
}).strict()

export const exportResponseSchema = exportDataSchema.extend({
  exportedAt: timestampSchema,
  scope: z.literal('kuvert-account-only'),
}).strict()

export const platformExportResponseSchema = exportEnvelopeSchema.extend({
  service: z.literal('kuvert'),
  data: exportDataSchema,
}).strict()

function withIsoCreatedAt<T extends { createdAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export function exportDataForUser(userId: string): z.infer<typeof exportDataSchema> {
  return db.transaction((tx) => {
    const localUser = tx.select({ currency: users.currency }).from(users).where(eq(users.id, userId)).get()
    const accountRows = tx.select().from(accounts).where(eq(accounts.userId, userId)).all()
    const periodRows = tx.select().from(periods).where(eq(periods.userId, userId)).all()
    const categoryRows = tx.select().from(categories).where(eq(categories.userId, userId)).all()
    const envelopeRows = tx.select().from(envelopes).where(eq(envelopes.userId, userId)).all()
    const budgetRows = tx.select({
      id: envelopeBudgets.id, envelopeId: envelopeBudgets.envelopeId, periodId: envelopeBudgets.periodId,
      allocated: envelopeBudgets.allocated, carriedOver: envelopeBudgets.carriedOver,
    }).from(envelopeBudgets)
      .innerJoin(envelopes, eq(envelopes.id, envelopeBudgets.envelopeId))
      .where(eq(envelopes.userId, userId)).all()
    const transactionRows = tx.select().from(transactions).where(eq(transactions.userId, userId)).all()
    const goalRows = tx.select().from(goals).where(eq(goals.userId, userId)).all()
    const contributionRows = tx.select({
      id: goalContributions.id, goalId: goalContributions.goalId, accountId: goalContributions.accountId,
      amount: goalContributions.amount, date: goalContributions.date, note: goalContributions.note,
      createdAt: goalContributions.createdAt,
    }).from(goalContributions)
      .innerJoin(goals, eq(goals.id, goalContributions.goalId))
      .where(eq(goals.userId, userId)).all()
    const debtRows = tx.select().from(debts).where(eq(debts.userId, userId)).all()

    return exportDataSchema.parse({
      currency: localUser?.currency ?? 'RUB',
      accounts: accountRows.map(withIsoCreatedAt),
      periods: periodRows.map(withIsoCreatedAt),
      categories: categoryRows,
      envelopes: envelopeRows.map(withIsoCreatedAt),
      envelopeBudgets: budgetRows,
      transactions: transactionRows.map(withIsoCreatedAt),
      goals: goalRows.map(withIsoCreatedAt),
      goalContributions: contributionRows.map(withIsoCreatedAt),
      debts: debtRows.map(withIsoCreatedAt),
    })
  })
}

// Retained for existing direct consumers. Its path, auth, and response shape
// intentionally remain separate from the platform export protocol.
const legacyRouter = new Hono()
legacyRouter.get('/', requireAuth, (c) => {
  const data = exportDataForUser(c.get('user').id)
  c.header('Cache-Control', 'no-store, private')
  c.header('Pragma', 'no-cache')
  c.header('X-Content-Type-Options', 'nosniff')
  return c.json({
    exportedAt: new Date().toISOString(),
    scope: 'kuvert-account-only' as const,
    ...data,
  })
})

const platformRouter = new Hono<ExportAuthEnv>()
platformRouter.get('/me', requireExportAuth, (c) => {
  const principal = c.get('exportPrincipal')
  c.header('Cache-Control', 'no-store, private')
  c.header('Pragma', 'no-cache')
  c.header('X-Content-Type-Options', 'nosniff')
  return c.json(platformExportResponseSchema.parse({
    version: '1',
    service: 'kuvert',
    exportedAt: new Date().toISOString(),
    data: exportDataForUser(principal.sub),
  }))
})

export { legacyRouter as exportRouter, platformRouter as exportsRouter }
