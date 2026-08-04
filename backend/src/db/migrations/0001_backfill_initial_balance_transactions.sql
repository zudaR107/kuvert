-- Custom SQL migration file, put your code below! --

-- Accounts created before POST /accounts started auto-creating an
-- opening transaction (see api/src/features/accounts/router.ts) only
-- ever recorded their starting balance in the now-inert
-- initial_balance column, with no matching transactions row. Since
-- GET /accounts/:id/balance computes purely from transactions (not
-- initial_balance, to avoid double-counting for accounts that DO have
-- an opening transaction), those accounts silently showed a balance
-- of 0 regardless of what initial_balance said. This backfills the
-- missing opening transaction for every such account, dated at the
-- account's own creation date, then zeroes initial_balance - the same
-- end state POST /accounts already establishes for new accounts.
INSERT INTO transactions (id, user_id, account_id, envelope_id, to_account_id, type, amount, date, note, import_id, created_at)
SELECT
	lower(hex(randomblob(16))),
	user_id,
	id,
	NULL,
	NULL,
	CASE WHEN initial_balance > 0 THEN 'income' ELSE 'expense' END,
	abs(initial_balance),
	date(created_at, 'unixepoch'),
	'Начальный баланс',
	NULL,
	created_at
FROM accounts
WHERE initial_balance != 0;
--> statement-breakpoint
UPDATE accounts SET initial_balance = 0 WHERE initial_balance != 0;
