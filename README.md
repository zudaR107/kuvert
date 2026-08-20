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
- [`schrank`](https://github.com/zudaR107/schrank) — file storage with nested folders
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
  recurring, regenerating a fresh cycle once the target is hit. Completing a goal (via a
  contribution or by lowering its target amount) fires a `kuvert.goal.completed.v1` event,
  delivered to the platform's [`glocke`](https://github.com/zudaR107/glocke) notification
  service through a transactional outbox.
- **Debts** — track money owed to you or by you, independent of the budget itself.
- **API documentation** — an admin-only OpenAPI spec (`GET /openapi.json`) and a Swagger
  UI viewer at `/docs` in the frontend app, generated from the API's own Zod schemas.
- **Direct Kuvert data export** — Settings downloads a versioned JSON snapshot through
  `GET /exports/me`, including local currency, archived records, and every Kuvert relation.
  The legacy account-scoped `GET /export` remains available unchanged.
- **Platform profile preferences** — displayed dates and calendar week starts follow
  the verified Schlüssel profile. They are shown in Kuvert settings but changed on
  Schlüssel's hosted account page.
- **Notification center** — the authenticated header links to Glocke and shows its
  unread count using Kuvert's existing in-memory access token.

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

Kuvert retains two synchronous direct JSON contracts. `GET /export` requires the same
bearer token as the rest of the API. Its JSON response
contains `exportedAt`, the fixed `kuvert-account-only` scope, `currency`, and the
`accounts`, `periods`, `categories`, `envelopes`, `envelopeBudgets`, `transactions`,
`goals`, `goalContributions`, and `debts` arrays. The full field-level response schema
is published in `GET /openapi.json`.

`GET /exports/me` returns the canonical version 1 envelope (`version`, `service`,
`exportedAt`, `data`), with all data reads performed in one SQLite transaction. It accepts
an ordinary access token or a JWKS-verified RS256 export delegation with the configured
exact issuer,
`token_use: export`, the single `hof-service:kuvert` audience, `data:export` scope, and
nonempty subject, job, and token IDs plus a non-expired numeric `exp`. The subject comes
only from the verified principal, and the delegation cannot access the legacy endpoint or
any other Kuvert API. The direct response is private, no-store, and nosniff.

Neither Kuvert endpoint creates a platform ZIP. Only Schlüssel's asynchronous
`/export-jobs` API does that, invoking this standardized endpoint from a fixed internal
registry. Every service snapshots independently when called, so the ZIP is not one
cross-service point-in-time transaction; retries retain successful snapshots and collect
failed services later. If at least one service succeeds, Schlüssel can publish a partial
archive whose `manifest.json` lists statuses, attempts, timestamps, byte counts, SHA-256
checksums, files, and sanitized failures.

Schlüssel protects ZIP status and owner-only downloads with no-store headers, a short
artifact TTL (24 hours by default), per-user cooldown/retention limits, response-size
bounds, a global storage quota, and a free-space reserve. Export files contain sensitive
financial data. Kuvert exports caller-owned budgeting rows and its local currency only;
it excludes passwords/tokens/keys, server configuration and logs, internal worker or
audit state, other users' rows, and data owned by other Hof services.

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
| `GLOCKE_URL` / `VITE_GLOCKE_URL` | Browser-facing Glocke origin for Compose / direct Vite use; used by the header bell and unread-count request |
| `GLOCKE_BASE_URL` | Glocke's internal API URL, for delivering notification events |
| `KUVERT_TO_GLOCKE_HMAC_KEY_ID` | Key ID Kuvert signs outgoing Glocke requests with |
| `KUVERT_TO_GLOCKE_HMAC_SECRET` | Matching HMAC secret; must equal Glocke's `GLOCKE_SOURCE_SECRET_KUVERT`. Omit both HMAC variables to queue events without delivery; partial credentials fail startup |
| `GLOCKE_OUTBOX_RETENTION_MS` | How long delivered and permanently failed notification rows are retained (default 2,147,483,647 ms, about 24.9 days); must be a positive timer-safe integer. Periodic cleanup runs even when delivery is disabled, while pending and in-flight rows are never removed |

The default Compose CORS allowlist includes Schlüssel's hosted browser origin. It is
distinct from the internal `schlussel:4000` container URL. Platform ZIP collection calls
Kuvert server-to-server and does not depend on browser CORS.

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
