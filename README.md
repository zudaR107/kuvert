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

- **Accounts** — checking/cash/credit/savings, with a computed running balance.
- **Budget periods & envelopes** — allocate money per period; unused, rollover-enabled
  envelopes carry their leftover into the next period automatically (computed lazily,
  the first time you view or allocate into that next period — no scheduled job).
- **Transactions** — income/expense/transfer, with account/envelope/type/date filters.
- **CSV import** — a generic, bank-agnostic format (`date,amount,type` required,
  `note`/`envelope` optional) for bulk-loading transaction history. See
  `POST /transactions/import` in the API.
- **Goals** — save toward a target with contributions from any account; goals can be
  marked recurring, regenerating a fresh cycle once the target is hit.
- **Debts** — track money owed to you or by you, independent of the budget itself.
- **API documentation** — an admin-only OpenAPI spec (`GET /openapi.json`) and a Swagger
  UI viewer at `/docs` in the frontend app, generated from the API's own Zod schemas.

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
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (backend) |
| `VITE_SCHLUSSEL_URL` | Where "sign in" redirects to (baked in at frontend build time) |
| `VITE_SCHLOSS_URL` | Where the header's "На главную" link points to (baked in at frontend build time) |

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
