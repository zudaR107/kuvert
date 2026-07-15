import { createRouter, createRootRouteWithContext, createRoute, Outlet, redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Layout } from '../components/Layout'
import { BudgetPage } from '../features/budget/BudgetPage'
import { EnvelopesPage } from '../features/envelopes/EnvelopesPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { AccountsPage } from '../features/accounts/AccountsPage'
import { DebtsPage } from '../features/debts/DebtsPage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage'
import { getAccessToken, api } from '../lib/api'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'
import { queryClient } from '../lib/queryClient'

interface RouterContext {
  queryClient: QueryClient
}

// A loader's job here is purely to warm the cache before the route
// transition completes, so the page component's own useQuery finds data
// already there instead of mounting empty and fetching (the "flash of
// empty content, then it pops in" every tab switch used to show). A
// prefetch failing (e.g. a network hiccup) must never turn into a hard
// error screen in place of the page - the component's own useQuery
// already retries and degrades gracefully, so loader errors are swallowed
// and left for it to handle exactly as it does today.
function prefetch(loader: (queryClient: QueryClient) => Promise<unknown>) {
  return async ({ context }: { context: RouterContext }) => {
    try {
      await loader(context.queryClient)
    } catch {
      // swallowed - see comment above
    }
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: AuthCallbackPage,
})

const protectedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: async () => {
    if (!getAccessToken()) {
      window.location.href = await buildSchluesselLoginUrl(window.location.pathname + window.location.search)
    }
  },
  component: () => <Layout><Outlet /></Layout>,
})

const indexRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/budget' }) },
})

const budgetRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/budget',
  // Mirrors BudgetPage's own default state (periodIndex = 0): warm the
  // periods list, then the budget for the most recent period, the same
  // two queries the page fetches sequentially on mount today.
  loader: prefetch(async (qc) => {
    const periods = await qc.ensureQueryData({
      queryKey: ['periods'],
      queryFn: () => api.get('/periods') as Promise<{ id: string }[]>,
    })
    if (periods[0]) {
      await qc.ensureQueryData({
        queryKey: ['budget', periods[0].id],
        queryFn: () => api.get(`/periods/${periods[0].id}/budget`),
      })
    }
  }),
  component: BudgetPage,
})

const envelopesRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/envelopes',
  loader: prefetch((qc) => Promise.all([
    qc.ensureQueryData({ queryKey: ['envelopes'], queryFn: () => api.get('/envelopes') }),
    qc.ensureQueryData({ queryKey: ['envelopeCategories'], queryFn: () => api.get('/envelopes/categories') }),
  ])),
  component: EnvelopesPage,
})

const transactionsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/transactions',
  // Mirrors TransactionsPage's default (no filters applied yet).
  loader: prefetch((qc) => Promise.all([
    qc.ensureQueryData({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') }),
    qc.ensureQueryData({ queryKey: ['envelopes'], queryFn: () => api.get('/envelopes') }),
    qc.ensureQueryData({ queryKey: ['transactions', ''], queryFn: () => api.get('/transactions') }),
  ])),
  component: TransactionsPage,
})

const goalsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/goals',
  loader: prefetch((qc) => Promise.all([
    qc.ensureQueryData({ queryKey: ['goals'], queryFn: () => api.get('/goals') }),
    qc.ensureQueryData({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') }),
  ])),
  component: GoalsPage,
})

const debtsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/debts',
  // Mirrors DebtsPage's default settledFilter state (false).
  loader: prefetch((qc) => qc.ensureQueryData({
    queryKey: ['debts', false],
    queryFn: () => api.get('/debts?settled=false'),
  })),
  component: DebtsPage,
})

const accountsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/accounts',
  loader: prefetch((qc) => qc.ensureQueryData({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts'),
  })),
  component: AccountsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/settings',
  loader: prefetch((qc) => qc.ensureQueryData({
    queryKey: ['userProfile'],
    queryFn: () => api.get('/users/me'),
  })),
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  authCallbackRoute,
  protectedLayout.addChildren([
    indexRoute,
    budgetRoute,
    envelopesRoute,
    transactionsRoute,
    goalsRoute,
    debtsRoute,
    accountsRoute,
    settingsRoute,
  ]),
])

export const router = createRouter({ routeTree, context: { queryClient } })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
