import { createRouter, createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { Layout } from '../components/Layout'
import { BudgetPage } from '../features/budget/BudgetPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { LoginPage } from '../features/auth/LoginPage'
import { getAccessToken } from '../lib/api'

// Placeholder pages for sections not yet implemented
function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>{title}</h1>
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        В разработке…
      </div>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const protectedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: () => {
    if (!getAccessToken()) {
      throw redirect({ to: '/login' })
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
  component: () => <Placeholder title="Транзакции" />,
})

const goalsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/goals',
  component: GoalsPage,
})

const debtsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/debts',
  component: () => <Placeholder title="Долги" />,
})

const accountsRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: '/accounts',
  component: () => <Placeholder title="Счета" />,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedLayout.addChildren([
    indexRoute,
    budgetRoute,
    transactionsRoute,
    goalsRoute,
    debtsRoute,
    accountsRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
