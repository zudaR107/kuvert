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
- Fixed logout not actually clearing the session: the cookie is
  host-only to schlussel's own origin, so a fetch to `/auth/logout`
  proxied through kuvert's own origin never carried it - the session
  was never cleared, and the redirect to the login page then silently
  re-authenticated via the still-valid session, making logout look
  like it did nothing. Now navigates to schlussel's own `/logout` page
  (same-origin there) instead.

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
- Shortened that same copy back down to one sentence each, matching
  every other tab's brief empty-state hint - kept the cross-reference,
  dropped the extra explanation.
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
- Adopted `@zudar107/schloss-ui`: Header and Footer now wrap the shared
  package's versions (the user's name is now shown as a single-initial
  avatar instead of visible text, and settings is a callback-driven
  button instead of a router link - both real, intentional design
  changes); replaced the emoji-based empty states across Budget,
  Accounts, Goals, Debts, and Transactions with the shared `EmptyState`
  component and real line icons (kept the two non-actionable cases -
  the closed-debts tab and "add an account first" - as local elements,
  since the shared component always requires an action button and
  forcing one there would be a bad match). Switched the platform's old
  shared blue to kuvert's own teal accent (`#0d9488`) - a real color
  change, distinct from the shared `--success` green so the two don't
  get confused - and fixed the sidebar/header/favicon logo's stroke
  width (2.2 -> 2) to match the shared icon rules.
- Adopted the rest of `@zudar107/schloss-ui`: every ad hoc button
  (`.btn-primary`/`.btn-ghost`/`.btn-danger`) across Accounts, Goals,
  Debts, Transactions, Budget, and Settings now uses the shared
  `Button` (icon-only ghost buttons keep a borderless look via a style
  override, matching the platform's existing icon-button convention);
  Debts' Активные/Закрытые two-button filter is now a `SegmentedControl`;
  transaction type indicators and debt status are now `Badge`s (a
  goal's "Достигнуто" pill also moved to `Badge` for the same reason,
  though not separately called out); account balances, Budget's
  Available column, debt amounts, and income/expense transaction rows
  now use `Amount`'s sign-based coloring (transfers keep their own
  info-blue text, since `Amount` only models gain/loss/neutral, not a
  third semantic color - forcing one would lose that distinction).
  Added `StatTile` summary strips to Goals, Debts, and Transactions
  (aggregated client-side from the already-fetched list, same
  single-currency assumption Budget's own "Осталось распределить"
  banner already made). The issue's mention of a shared "Card"
  component and a "Скоро" badge don't apply here - schloss-ui never
  shipped a Card component (Account/Goal/Debt cards already used a
  tinted icon-badge treatment close to the target pattern, just with
  no component to formally adopt), and "Скоро" is schloss's own
  placeholder pill, not kuvert's. Also swapped Budget's hardcoded 💰
  emoji for a real line icon, matching the platform's icon rules.
  Existing tests kept passing completely unchanged.
- Adopted the last three pieces of `@zudar107/schloss-ui`: every
  create/edit form's inputs across Accounts, Goals, Debts,
  Transactions, and Budget periods (plus Settings' currency select)
  now use the shared `Field` (currency prefix on amount fields, real
  labels); the local `Modal` component is replaced by the shared one
  everywhere (icon-in-title, real icon close-button, footer actions
  built from the shared `Button` with primary rightmost) and deleted
  outright, now unused; and the shared `Toast` gets its first real
  usage anywhere on the platform - a success toast after each
  create/update/archive/settle/delete resolves, an error toast on a
  failed request, via a small new `useToast` hook shared across pages.
  Each form's submit button now lives in the Modal's footer rather
  than inside the form itself - the form keeps its native `onSubmit`
  handling, and the footer button triggers it via `id` +
  `HTMLFormElement.requestSubmit()` rather than an inline button.
  Existing tests kept passing completely unchanged; new tests for
  `useToast` and the first page's toast wiring were written by an
  independent subagent from a behavioral spec.
- Bumped `schloss-ui` for `StatTile`'s row-misalignment fix (a long
  wrapped label no longer pushes its tile's value down relative to its
  row's other tiles) and `Badge`'s baseline-mismatch fix against plain
  text - both used here (Transactions' summary tiles and type badges,
  Debts/Goals/Envelopes' status badges).
- Every form (Transactions, Accounts, Goals, Debts, the budget period/
  allocation editor) now validates its own inputs client-side and
  highlights the specific invalid field in red, instead of silently
  defaulting invalid input or relying on a generic error toast. Closes
  several previously-silent gaps: transaction/goal/debt amounts used
  `parseFloat(...) || 0`, so an empty or garbled amount silently became a
  0-amount submission; a transfer's destination account could be left
  unselected; currency codes weren't format-checked; a negative budget
  allocation could be typed and sent to a server route that only rejects
  it after the fact. New `lib/validation.ts` centralizes the rules
  (required text, amount > 0, valid date). Bumped `schloss-ui` again for
  `Field`'s new `error`-driven red border and `invalid` prop, both needed
  here (`AmountField`/`DateField`/`NumberField` already forwarded them
  transparently, needing no changes of their own).
- Header was missing a theme toggle - it only existed in the sidebar,
  unlike schloss's and schlussel's headers, which both show one. Added
  `rightSlot={<ThemeToggle />}` to match. Also bumped the vendored
  `schloss-ui` submodule pointer to pick up `ThemeToggle`'s
  dropdown-positioning fix (schloss-ui#59/#60) - the sidebar's own theme
  switcher is exactly the case that bug affected (dropdown running off
  the bottom of a short viewport).
- The selected theme didn't carry over to/from schloss and schlussel -
  each is a separate origin, so `localStorage` isn't shared. Mounted the
  new `ThemeSync` component (schloss-ui#61) pointed at schlussel's
  `/theme-sync.html` hub, unconditionally and before the auth-loading
  check (theme sync has nothing to do with being signed in).
- The theme dropdown could cover its own trigger in the sidebar (the
  off-screen correction pinned it to the viewport bottom regardless of
  where the trigger was), and the sync above didn't actually work (a
  freshly-visited origin's own default-theme timestamp could outrank a
  real pick made moments earlier on another origin). Bumped `schloss-ui`
  again for both fixes (schloss-ui#63/#64).
- The sync still didn't actually work even after that, for a bigger
  reason: the hidden-iframe design's own storage was partitioned by
  Firefox/Safari per embedding site, so it could never sync anything
  regardless of application logic. Replaced with `ThemeSync` talking
  directly to a real API (`GET`/`PUT` schlussel's `/theme`) via plain
  `fetch` - `hubOrigin` prop renamed `apiOrigin`, no more hidden iframe.
  Bumped `schloss-ui` again.

## Budget logic
- Lazy, cron-free envelope rollover between budget periods.
- Recurring goal regeneration once a goal's target is reached.
- Universal CSV transaction import.
- Security audit fixes: `POST`/`PUT /transactions`, `POST
  /goals/:id/contribute`, and `POST`/`PUT /envelopes` only checked that a
  referenced `accountId`/`envelopeId`/`toAccountId`/`categoryId` existed
  (via the DB's foreign key), not that it actually belonged to the calling
  user - now verified the same way `periods`' allocation route already
  did. `GET /accounts/:id/balance` now also scopes its transaction sum by
  `userId`, not just `accountId`, for defense in depth. Added a global
  5MB request body size limit (`hono/body-limit`) - nothing previously
  bounded the size of a pasted CSV import.

## Infrastructure
- CI (tests + lint) on every push/PR.
- Docker Compose networking on a shared `schloss-net`.
- Migrated from nginx to Caddy in the web image.
- Docker images published to GHCR on merge to `main`.
- Dependabot for both npm and GitHub Actions dependencies.
- Added a Dependabot `ignore` rule for `better-sqlite3` major-version
  bumps in `/api` - v13 dropped prebuilt binaries entirely (always
  compiles from source via `node-gyp` now, on every platform), which
  broke schlussel's Docker build after the same routine bump there.
  kuvert-api is still on `^12.11.1` and was never actually affected;
  this is purely preventive.
- Dropped published host port - reached only through the tor gateway now.
- Fixed docker-compose.yml's default `ALLOWED_ORIGINS`/`VITE_SCHLUSSEL_URL`
  to `https://` - tor's gateway auto-upgrades everything to HTTPS, so the
  old `http://` defaults broke CORS and the login redirect target.
- Renamed docker-compose.yml's outer `ALLOWED_ORIGINS` substitution
  variable to `KUVERT_ALLOWED_ORIGINS` - it was silently colliding with
  schlussel's own `ALLOWED_ORIGINS` default when tor's compose file
  includes both under one shared `.env`. Container-internal env var name
  is unchanged.
- Pinned `pnpm/action-setup`'s version exactly in CI - letting it
  self-update to the latest 11.x broke every workflow run once pnpm
  11.12.0 shipped with a bug in its own self-installer, unrelated to
  any change in this repo.
- Security audit finding: the `/auth/*` proxy to schlussel forwarded a
  client-supplied `X-Schlussel-Frontend` header unchanged - that header
  is schlussel's own signal for "this request is genuinely same-origin to
  my own hosted frontend," and only schlussel-web's own Caddyfile is
  supposed to ever set it. Now stripped (`header_up -X-Schlussel-Frontend`)
  before proxying, so it can only ever be absent through this path.
- Retrofitted onto two new shared platform packages instead of kuvert's
  own duplicated copies: `api/src/middleware/auth.ts`'s JWKS verification
  and `index.ts`'s CORS setup now delegate to a new
  `@zudar107/schloss-server-kit` submodule (`createAuthMiddleware`/
  `createCorsMiddleware`); `web/src/lib/{pkce,authRedirect,api}.ts` and
  `hooks/useAuth.ts` are now thin wrappers around `@zudar107/schloss-ui`'s
  new config-driven auth exports; `Layout.tsx`'s hand-rolled sidebar
  resize/collapse state machine is now `schloss-ui`'s `useSidebarWidth`
  hook. Pure refactor - kuvert's own existing test suite is the
  regression check (one test file's `setAccessToken` spy target moved
  from the module export to the shared client instance it now actually
  gets called on, no behavior change). Both Dockerfiles updated to build
  `schloss-server-kit` from source alongside the existing `schloss-ui`
  step; a `--prod` install strips devDependencies workspace-wide, which
  broke `hono` (only a peerDependency of the kit) resolving at runtime in
  the api image until its `node_modules` was also copied from the
  non-prod builder stage - caught by an actual container boot+`/health`+
  `/accounts` 401 smoke test, not just a build-succeeds check.

## Docs
- README, AGPL-3.0 LICENSE, CONTRIBUTING.md.
- Added CODE_OF_CONDUCT.md, SECURITY.md, issue templates, and a pull
  request template.
- Added an admin-only OpenAPI spec (GET /openapi.json, gated behind a new
  requireAdmin middleware) and a Swagger UI viewer at /docs in the web
  app, fed by the same schema-derived document.
- Added the OpenAPI docs viewer to the README's feature list, and an
  "Updated docs" line to the PR checklist template.
- The `/docs` Swagger viewer wasn't linked from the sidebar - the only way
  to reach it was typing the URL directly. Added a nav item, shown only
  for admins (it 403s the spec request for anyone else).
- Added a `/help` page: a plain-language usage guide for regular end
  users, covering the envelope-budgeting model and one section per main
  tab (Счета, Бюджет, Транзакции, Цели, Долги, Настройки). Reachable via
  a new always-visible "Справка" sidebar entry (unlike the admin-only
  "Документация API" link) and the shared Footer's help link. Text
  skeleton only for now, with screenshot slots at
  `web/public/guide/kuvert-*.png` for the user to fill in later.
- Fixed the `/help` page's "Первые шаги" numbered list rendering with no
  visible `1./2./3.` markers - just unexplained indentation. Tailwind's
  preflight base styles reset `ol`/`ul` to `list-style: none`; the page's
  own inline style set the indent (`paddingLeft`) but never restored a
  `list-style-type`. Added `listStyleType: 'decimal'` explicitly.

## Polish
- Distinct favicon and a fixed browser tab title (was still the literal
  Vite default "web").
- License/CI badges, a link to the Hof meta-repo, fixed gateway repo URL
  casing after its rename to lowercase.
- Wrote the gateway's project name lowercase ("tor") everywhere in prose.
- Fixed the Transactions page's account/envelope/type filter selects
  rendering visually tall - they were plain unlabeled `<select>`s
  stretching (flex's default `align-items: stretch`) to match the taller
  labeled "Период" date-range field beside them. Switched all three to
  the shared labeled `Field` select, matching height and style.
- Fixed a broken production build after a Dependabot batch bumped
  TypeScript to 7: `routeLoaders.test.tsx` used the Node-specific
  `global.fetch`, which only ever typechecked because something in the
  older dependency graph transitively pulled in `@types/node`'s ambient
  `global` declaration - `web/tsconfig.app.json`'s own `types` array
  deliberately excludes `node`. Switched to `globalThis.fetch`, the
  standard cross-environment reference already used elsewhere, which
  needs no ambient Node types at all.
