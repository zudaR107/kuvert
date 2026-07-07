import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ── Users (mirrored from Schlüssel via JWT) ───────────────────────
// We store only the user id from the JWT — no passwords here.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('RUB'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Accounts ──────────────────────────────────────────────────────
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['checking', 'cash', 'credit', 'savings'] }).notNull().default('checking'),
  currency: text('currency').notNull().default('RUB'),
  // Balance in minor units (kopecks/cents) to avoid floating point
  initialBalance: integer('initial_balance').notNull().default(0),
  color: text('color').notNull().default('#3b82f6'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Budget periods ─────────────────────────────────────────────────
export const periods = sqliteTable('periods', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(), // ISO date string YYYY-MM-DD
  endDate: text('end_date').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Envelope categories ────────────────────────────────────────────
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  sortOrder: integer('sort_order').notNull().default(0),
})

// ── Envelopes (spending categories) ───────────────────────────────
export const envelopes = sqliteTable('envelopes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('wallet'),
  color: text('color').notNull().default('#3b82f6'),
  rolloverEnabled: integer('rollover_enabled', { mode: 'boolean' }).notNull().default(true),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Envelope budget per period ─────────────────────────────────────
export const envelopeBudgets = sqliteTable('envelope_budgets', {
  id: text('id').primaryKey(),
  envelopeId: text('envelope_id').notNull().references(() => envelopes.id, { onDelete: 'cascade' }),
  periodId: text('period_id').notNull().references(() => periods.id, { onDelete: 'cascade' }),
  // Amount allocated to this envelope for this period (minor units)
  allocated: integer('allocated').notNull().default(0),
  // Carried over from previous period (minor units)
  carriedOver: integer('carried_over').notNull().default(0),
})

// ── Transactions ───────────────────────────────────────────────────
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  envelopeId: text('envelope_id').references(() => envelopes.id, { onDelete: 'set null' }),
  // For transfers: the destination account
  toAccountId: text('to_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
  // Amount in minor units, always positive
  amount: integer('amount').notNull(),
  date: text('date').notNull(), // ISO YYYY-MM-DD
  note: text('note'),
  // For future CSV import tracking
  importId: text('import_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Goals ─────────────────────────────────────────────────────────
export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('target'),
  color: text('color').notNull().default('#10b981'),
  targetAmount: integer('target_amount').notNull(), // minor units
  currentAmount: integer('current_amount').notNull().default(0), // minor units
  deadline: text('deadline'), // ISO YYYY-MM-DD, nullable
  // If true, a new goal cycle is created after completion
  recurring: integer('recurring', { mode: 'boolean' }).notNull().default(false),
  // Day of month to auto-create (1-28), null = manual
  recurringDay: integer('recurring_day'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Goal contributions ─────────────────────────────────────────────
export const goalContributions = sqliteTable('goal_contributions', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // minor units
  date: text('date').notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Debts ──────────────────────────────────────────────────────────
export const debts = sqliteTable('debts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  counterparty: text('counterparty').notNull(),
  // owed = others owe me; owing = I owe others
  type: text('type', { enum: ['owed', 'owing'] }).notNull(),
  amount: integer('amount').notNull(), // minor units
  currency: text('currency').notNull().default('RUB'),
  dueDate: text('due_date'), // nullable
  note: text('note'),
  settled: integer('settled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Type exports ───────────────────────────────────────────────────
export type User = typeof users.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Period = typeof periods.$inferSelect
export type Category = typeof categories.$inferSelect
export type Envelope = typeof envelopes.$inferSelect
export type EnvelopeBudget = typeof envelopeBudgets.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Goal = typeof goals.$inferSelect
export type GoalContribution = typeof goalContributions.$inferSelect
export type Debt = typeof debts.$inferSelect
