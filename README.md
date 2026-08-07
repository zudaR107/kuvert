# Kuvert

[![Test](https://github.com/zudaR107/kuvert/actions/workflows/test.yml/badge.svg)](https://github.com/zudaR107/kuvert/actions/workflows/test.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

Part of the [Hof platform](https://github.com/zudaR107/Hof) — a suite of
self-hosted personal services:

- [`schloss`](https://github.com/zudaR107/schloss) — home page / launcher
- [`schlussel`](https://github.com/zudaR107/schlussel) — auth: accounts, login, tokens
- **`kuvert`** (this repo) — envelope budgeting
- [`tafel`](https://github.com/zudaR107/tafel) — task/project tracking
- [`zettel`](https://github.com/zudaR107/zettel) — markdown note-taking
- [`glocke`](https://github.com/zudaR107/glocke) — in-app notification center and delivery foundation
- [`tor`](https://github.com/zudaR107/tor) — reverse-proxy gateway
- [`schloss-ui`](https://github.com/zudaR107/schloss-ui) — shared frontend components
- [`schloss-server-kit`](https://github.com/zudaR107/schloss-server-kit) — shared backend auth/CORS kit

Kuvert ("envelope" in German) is an envelope-budgeting service. Money gets allocated
into named envelopes for each budget period; spending against an envelope is tracked
from your transactions, and unused money can roll over into the next period.

## How it fits into the platform

Kuvert has no login form of its own. An unauthenticated visitor is redirected to
Schlüssel's hosted login page and back; the API verifies the resulting token itself
against Schlüssel's public key (JWKS) rather than calling back to Schlüssel on every
request.

This repo is a pnpm workspace with two packages:

- `backend/` — the Hono + Drizzle/SQLite backend
- `frontend/` — the React frontend

## Features

- **Accounts** — checking/cash/credit/savings, with a transaction-derived running
  balance. A non-zero opening balance is created atomically with its matching income
  or expense transaction, and is creation-only after that.
- **Budget periods & envelopes** — allocate money per period; unused, rollover-enabled
  envelopes carry their leftover into the next period automatically (computed lazily,
  the first time you view or allocate into that next period — no scheduled job).
- **Transactions** — income/expense/transfer, with account/envelope/type/date filters.
  Filters are applied before pagination; account filtering and balances include both
  sides of a transfer.
- **CSV import** — a generic, bank-agnostic format (`date,amount,type` required,
  `note`/`envelope` optional) for bulk-loading transaction history into one selected
  account. Strict parsing rejects malformed CSV quote grammar; valid rows still import
  when other rows fail, with each rejected row reported in the result. See
  `POST /transactions/import` in the API.
- **Goals** — track progress toward a target, with an account recorded as context only;
  contributions do not change account balances or create transactions. Goals can be marked
  recurring, regenerating a fresh cycle once the target is hit.
- **Debts** — track money owed to you or by you, independent of the budget itself.
- **API documentation** — an admin-only OpenAPI spec (`GET /openapi.json`) and a Swagger
  UI viewer at `/docs` in the frontend app, generated from the API's own Zod schemas.
- **Account-scoped export** — `GET /export` returns the current user's Kuvert records
  and service-local currency preference; it never includes another user's data.
- **Platform profile preferences** — displayed dates and calendar week starts follow
  the verified Schlüssel profile. They are shown in Kuvert settings but changed on
  Schlüssel's hosted account page.

### Transaction constraints

All API amounts outside CSV import are integer minor units (for example, cents).
Transfers require caller-owned, distinct source and destination accounts with the same
currency. A transfer cannot be assigned to an envelope, and a non-transfer cannot have
a destination account. Once an account is linked to a transfer as either source or
destination, changing that account's currency returns `409 Conflict`; remove the linked
transfer first if the currency genuinely needs to change.

`GET /transactions` applies `accountId`, `envelopeId`, `type`, `from`, and `to` in SQL
before `limit`/`offset`. Date bounds are inclusive, and an `accountId` filter includes
transfers where the account is either the source or destination.

### CSV import contract

CSV headers are case-insensitive and can appear in any order. `date` must be a real
`YYYY-MM-DD` calendar date, `amount` must be a positive decimal in major units, and
`type` must be `income` or `expense`; CSV import does not infer transfers. `note` is
limited to 500 characters. `envelope` is matched case-insensitively to an existing
envelope owned by the current user, and an unknown name is left unlinked rather than
created. Quoted fields may contain commas/newlines and use `""` for an escaped quote.
Malformed quote grammar rejects the whole import; otherwise valid rows are inserted and
invalid rows are skipped and returned as `{ row, error }`. Imports are not deduplicated.

### Export response

`GET /export` requires the same bearer token as the rest of the API. Its JSON response
contains `exportedAt`, the fixed `kuvert-account-only` scope, `currency`, and the
`accounts`, `periods`, `categories`, `envelopes`, `envelopeBudgets`, `transactions`,
`goals`, `goalContributions`, and `debts` arrays. The full field-level response schema
is published in `GET /openapi.json`.

## Local development

```sh
pnpm install
cp .env.example .env
pnpm dev:backend    # API on http://localhost:3001
pnpm dev:frontend   # frontend on http://localhost:5174
```

```sh
pnpm --filter backend test
pnpm --filter backend lint
pnpm --filter frontend test
pnpm --filter frontend lint
```

### Environment variables

See `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite file path (backend) |
| `SCHLUSSEL_JWKS_URL` | Where the backend fetches Schlüssel's public key to verify tokens |
| `JWT_ISSUER` | Must match Schlüssel's own issuer, or every token gets rejected |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist when running the backend directly |
| `KUVERT_ALLOWED_ORIGINS` | Kuvert-specific CORS allowlist used by Docker Compose |
| `SCHLUSSEL_WEB_URL` / `VITE_SCHLUSSEL_URL` | Schlüssel hosted frontend URL for Compose / direct Vite use (not its internal API URL) |
| `SCHLOSS_URL` / `VITE_SCHLOSS_URL` | Platform home URL for Compose / direct Vite use |

The default Compose CORS allowlist includes Schlüssel's browser origin because its
hosted account page calls Kuvert's scoped `GET /export` with the same platform bearer
token. Do not replace that origin with the internal `schlussel:4000` container URL.

## Running with Docker

```sh
docker network create schloss-net   # one-time, shared with the other repos
docker compose up -d
```

Neither service publishes a host port — both are reached through the
[tor](https://github.com/zudaR107/tor) gateway (`https://kuvert.localhost` in local dev
- tor's Caddy auto-upgrades everything to HTTPS with its own locally-trusted CA), on the
same `schloss-net` network as `schlussel` and `schloss`.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
