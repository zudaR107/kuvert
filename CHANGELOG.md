# Changelog

Brief log of notable changes, grouped by theme — not a full commit history
(see `git log` for that). New entries get appended under the section they
fit best; add a new section if none fits.

## Auth
- Fixed logout not navigating away immediately.
- Migrated from a local login page to the centralized schlussel auth flow.
- Adopted Authorization Code + PKCE for the login handoff: generates and
  stores a PKCE verifier before redirecting, and the callback page
  exchanges the returned code for the real token via POST /auth/token
  instead of reading it from the URL fragment.

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
- Dropped published host port - reached only through the tor gateway now.
- Fixed docker-compose.yml's default `ALLOWED_ORIGINS`/`VITE_SCHLUSSEL_URL`
  to `https://` - tor's gateway auto-upgrades everything to HTTPS, so the
  old `http://` defaults broke CORS and the login redirect target.
- Renamed docker-compose.yml's outer `ALLOWED_ORIGINS` substitution
  variable to `KUVERT_ALLOWED_ORIGINS` - it was silently colliding with
  schlussel's own `ALLOWED_ORIGINS` default when tor's compose file
  includes both under one shared `.env`. Container-internal env var name
  is unchanged.

## Docs
- README, AGPL-3.0 LICENSE, CONTRIBUTING.md.
- Added CODE_OF_CONDUCT.md, SECURITY.md, issue templates, and a pull
  request template.

## Polish
- Distinct favicon and a fixed browser tab title (was still the literal
  Vite default "web").
- License/CI badges, a link to the Hof meta-repo, fixed gateway repo URL
  casing after its rename to lowercase.
- Wrote the gateway's project name lowercase ("tor") everywhere in prose.
