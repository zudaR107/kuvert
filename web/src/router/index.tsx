import { createRouter, createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { Layout } from '../components/Layout'
import { BudgetPage } from '../features/budget/BudgetPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { AccountsPage } from '../features/accounts/AccountsPage'
import { DebtsPage } from '../features/debts/DebtsPage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage'
import { getAccessToken } from '../lib/api'
import { buildSchluesselLoginUrl } from '../lib/authRedirect'

const rootRoute = createRootRoute({
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
  component: BudgetPage,
})

const transactionsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/transactions',
  component: TransactionsPage,
})

const goalsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/goals',
  component: GoalsPage,
})

const debtsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/debts',
  component: DebtsPage,
})

const accountsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/accounts',
  component: AccountsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  authCallbackRoute,
  protectedLayout.addChildren([
    indexRoute,
    budgetRoute,
    transactionsRoute,
    goalsRoute,
    debtsRoute,
    accountsRoute,
    settingsRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
