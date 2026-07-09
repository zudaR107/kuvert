# Kuvert

Kuvert ("envelope" in German) is an envelope-budgeting service — the first real service
built on top of the Schloss platform. Money gets allocated into named envelopes for each
budget period; spending against an envelope is tracked from your transactions, and
unused money can roll over into the next period.

## How it fits into the platform

Each service is its own repo, named after a German word related to what it does:

- [`schloss`](https://github.com/zudaR107/schloss) — the home page / launcher
- [`schlussel`](https://github.com/zudaR107/schlussel) — auth: accounts, login, tokens
- **`kuvert`** (this repo) — envelope budgeting

Kuvert has no login form of its own. An unauthenticated visitor is redirected to
Schlüssel's hosted login page and back; the API verifies the resulting token itself
against Schlüssel's public key (JWKS) rather than calling back to Schlüssel on every
request.

This repo is a pnpm workspace with two packages:

- `api/` — the Hono + Drizzle/SQLite backend
- `web/` — the React frontend

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

## Local development

```sh
pnpm install
cp .env.example .env
pnpm dev:api   # API on http://localhost:3001
pnpm dev:web   # web on http://localhost:5174
```

```sh
pnpm --filter api test
pnpm --filter api lint
pnpm --filter web test
pnpm --filter web lint
```

### Environment variables

See `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_PATH` | SQLite file path (API) |
| `SCHLUSSEL_JWKS_URL` | Where the API fetches Schlüssel's public key to verify tokens |
| `JWT_ISSUER` | Must match Schlüssel's own issuer, or every token gets rejected |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (API) |
| `VITE_SCHLUSSEL_URL` | Where "sign in" redirects to (baked in at web build time) |

## Running with Docker

```sh
docker network create schloss-net   # one-time, shared with the other repos
docker compose up -d
```

Neither service publishes a host port — both are reached through the
[Tor](https://github.com/zudaR107/Tor) gateway (`http://kuvert.localhost` in local dev),
on the same `schloss-net` network as `schlussel` and `schloss`.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
