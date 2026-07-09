# Changelog

Brief log of notable changes, grouped by theme — not a full commit history
(see `git log` for that). New entries get appended under the section they
fit best; add a new section if none fits.

## Auth
- Fixed logout not navigating away immediately.
- Migrated from a local login page to the centralized schlussel auth flow.

## UI
- Modal primitive; real Accounts, Debts, and Transactions pages (previously
  "in development" placeholders).
- Wired up the create/contribute buttons on the Budget and Goals pages.
- Settings page (currency) backed by a new `/users/me` endpoint.

## Budget logic
- Lazy, cron-free envelope rollover between budget periods.
- Recurring goal regeneration once a goal's target is reached.
- Universal CSV transaction import.

## Infrastructure
- CI (tests + lint) on every push/PR.
- Docker Compose networking on a shared `schloss-net`.
- Migrated from nginx to Caddy in the web image.
- Docker images published to GHCR on merge to `main`.
- Dependabot for both npm and GitHub Actions dependencies.
- Dropped published host port - reached only through the Tor gateway now.

## Docs
- README, AGPL-3.0 LICENSE, CONTRIBUTING.md.

## Polish
- Distinct favicon and a fixed browser tab title (was still the literal
  Vite default "web").
- License/CI badges, a link to the Hof meta-repo, fixed Tor->tor URL casing
  after the gateway repo's rename.
