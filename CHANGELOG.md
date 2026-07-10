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
- Restore the stored theme before first paint too (a synchronous inline
  script in index.html's `<head>`, matching schloss and schlussel/web),
  and render a themed blank div in AuthCallbackPage instead of nothing -
  reduces the flash during the SSO silent-reauth redirect chain, which
  can load and unload this app's pages within a fraction of a second.

## UI
- Modal primitive; real Accounts, Debts, and Transactions pages (previously
  "in development" placeholders).
- Wired up the create/contribute buttons on the Budget and Goals pages.
- Settings page (currency) backed by a new `/users/me` endpoint.
- Sidebar is now resizable by dragging anywhere along its right edge
  (previously only a tiny 24x24 toggle button, jumping between two fixed
  widths) - drags below a threshold snap shut to the icon-only rail;
  the expanded width is remembered in localStorage.
- Sidebar now shows the signed-in user's name and email above the
  logout button (previously not shown anywhere); added a Footer
  matching schloss's Header/Footer component structure, rendered below
  the main content area on every page.
- Expanded the Budget and Accounts empty-state copy to explain the
  difference between the two (envelopes/spending categories vs. real
  money containers), with each page cross-referencing the other by name.
- Every protected route now prefetches its page's data via a TanStack
  Router loader before the route transition completes, instead of the
  page component fetching only after mounting - removes the "renders
  empty, then content pops in" flash on the first visit to each tab per
  session.
- Replaced the sidebar's small round toggle button with click-anywhere:
  clicking any empty area of the sidebar (not a nav link, the theme
  button, the logout button, or the user identity block) collapses or
  expands it.
- Fixed the Footer (added in a previous batch) being clipped and
  unreachable on any page with enough content - `<main>` was missing
  `min-height: 0`, a flexbox gotcha that let it grow past the viewport
  instead of scrolling within its space, pushing the Footer past the
  parent's `overflow: hidden`.
- Fixed the sidebar reverting a just-completed drag-resize back to its
  previous width whenever the pointer ended up back over the sidebar
  itself on release - a synthetic click browsers fire right after a
  drag was bubbling to the click-to-toggle handler and immediately
  collapsing it.
- Added a Header, always visible (desktop and mobile) at the top of the
  main content area - previously the only header on mobile was bare
  branding with no way back to schloss or to settings, and the sidebar
  (which does carry identity/settings/logout) is hidden entirely below
  the mobile breakpoint. Sits alongside the sidebar's own controls
  rather than replacing them.

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
