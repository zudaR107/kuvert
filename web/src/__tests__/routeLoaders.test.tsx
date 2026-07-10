import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { router } from '../router/index'
import { queryClient } from '../lib/queryClient'

// ---------------------------------------------------------------------------
// These tests deliberately do NOT read src/router/index.tsx or
// src/lib/queryClient.ts — they exercise the loaders purely through the
// public `router` object and assert on the QueryClient cache, exactly as a
// consumer of the contract would. `fetch` is mocked at the `/api/...` URL
// level (the same boundary `src/lib/api.ts`'s `request()` calls through).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const periodFixture = {
  id: 'period-abc',
  name: 'Июль 2026',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
}

const budgetFixture = {
  period: periodFixture,
  toBeBudgeted: 1234,
  envelopes: [
    {
      envelope: { id: 'env-1', name: 'Продукты', icon: '🛒', color: '#4caf50', rolloverEnabled: false },
      allocated: 20000,
      carriedOver: 0,
      available: 15000,
      spent: 5000,
    },
  ],
}

const accountsFixture = [
  { id: 'acc-1', name: 'Основной счёт', type: 'checking', currency: 'RUB' },
]

const goalsFixture = [{ id: 'goal-1', name: 'Отпуск', targetAmount: 100000 }]

const debtsFixture = [{ id: 'debt-1', name: 'Друг', amount: 5000, settled: false }]

const envelopesFixture = [{ id: 'env-1', name: 'Продукты', icon: '🛒', color: '#4caf50', rolloverEnabled: false }]

const transactionsFixture = [{ id: 'tx-1', amount: -500, envelopeId: 'env-1' }]

const userProfileFixture = { id: 'user-1', email: 'test@example.com', name: 'Тест Тестов' }

// ---------------------------------------------------------------------------
// fetch mock helper — routes by exact URL string, mirrors how `src/lib/api.ts`
// calls `fetch(`/api${path}`)`.
// ---------------------------------------------------------------------------
type FetchResult = { status?: number; ok?: boolean; body: unknown }

function setFetchMock(handler: (url: string) => FetchResult | null) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const result = handler(url)
    if (!result) throw new Error(`Unexpected fetch: ${url}`)
    const status = result.status ?? 200
    const ok = result.ok ?? (status >= 200 && status < 300)
    return {
      ok,
      status,
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    } as Response
  }) as unknown as typeof fetch
}

function setFetchRejects() {
  global.fetch = vi.fn(async () => {
    throw new Error('network error')
  }) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Loader-context helper — minimal stand-in for TanStack Router's
// `LoaderFnContext`, containing only what a well-behaved loader should need.
// ---------------------------------------------------------------------------
function makeLoaderContext(overrides: Record<string, unknown> = {}) {
  return {
    context: { queryClient },
    params: {},
    deps: {},
    location: router.state.location,
    abortController: new AbortController(),
    preload: false,
    cause: 'enter' as const,
    navigate: () => {},
    parentMatchPromise: Promise.resolve() as unknown,
    route: undefined,
    ...overrides,
  }
}

function getLoader(routeId: string) {
  const route = router.routesById[routeId as keyof typeof router.routesById] as
    | { options: { loader?: (ctx: unknown) => unknown } }
    | undefined
  expect(route, `route ${routeId} should exist on router.routesById`).toBeDefined()
  const loader = route!.options.loader
  expect(loader, `route ${routeId} should define a loader`).toBeTypeOf('function')
  return loader!
}

beforeEach(() => {
  queryClient.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  queryClient.clear()
})

// ---------------------------------------------------------------------------
// Same QueryClient instance used by the app and by the router
// ---------------------------------------------------------------------------
describe('shared QueryClient instance', () => {
  it('router is created with the same queryClient exported from src/lib/queryClient.ts', () => {
    expect(router.options.context?.queryClient).toBe(queryClient)
  })
})

// ---------------------------------------------------------------------------
// /budget
// ---------------------------------------------------------------------------
describe('/budget route loader', () => {
  it('prefetches periods and, since periods is non-empty, the budget for the first period', async () => {
    setFetchMock((url) => {
      if (url === '/api/periods') return { body: [periodFixture] }
      if (url === `/api/periods/${periodFixture.id}/budget`) return { body: budgetFixture }
      return null
    })

    const loader = getLoader('/protected/budget')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['periods'])).toEqual([periodFixture])
    expect(queryClient.getQueryData(['budget', periodFixture.id])).toEqual(budgetFixture)
  })

  it('does not fetch budget (and does not throw) when periods is empty', async () => {
    setFetchMock((url) => {
      if (url === '/api/periods') return { body: [] }
      return null // any other fetch is "unexpected" and would throw
    })

    const loader = getLoader('/protected/budget')
    await expect(loader(makeLoaderContext())).resolves.not.toBeInstanceOf(Error)

    expect(queryClient.getQueryData(['periods'])).toEqual([])
    // Exactly one fetch call — periods only, no /budget follow-up.
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(1)
  })

  it('swallows a fetch failure instead of throwing/rejecting', async () => {
    setFetchRejects()

    const loader = getLoader('/protected/budget')
    let caught: unknown
    try {
      await loader(makeLoaderContext())
    } catch (e) {
      caught = e
    }
    expect(caught).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// /accounts
// ---------------------------------------------------------------------------
describe('/accounts route loader', () => {
  it('prefetches accounts under queryKey ["accounts"]', async () => {
    setFetchMock((url) => {
      if (url === '/api/accounts') return { body: accountsFixture }
      return null
    })

    const loader = getLoader('/protected/accounts')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['accounts'])).toEqual(accountsFixture)
  })

  it('swallows a fetch failure instead of throwing/rejecting', async () => {
    setFetchRejects()

    const loader = getLoader('/protected/accounts')
    let caught: unknown
    try {
      await loader(makeLoaderContext())
    } catch (e) {
      caught = e
    }
    expect(caught).toBeUndefined()
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined()
  })

  it('swallows a non-2xx response instead of throwing/rejecting', async () => {
    setFetchMock((url) => {
      if (url === '/api/accounts') return { body: { error: 'boom' }, status: 500, ok: false }
      return null
    })

    const loader = getLoader('/protected/accounts')
    let caught: unknown
    try {
      await loader(makeLoaderContext())
    } catch (e) {
      caught = e
    }
    expect(caught).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// /goals
// ---------------------------------------------------------------------------
describe('/goals route loader', () => {
  it('prefetches both goals and accounts in parallel', async () => {
    setFetchMock((url) => {
      if (url === '/api/goals') return { body: goalsFixture }
      if (url === '/api/accounts') return { body: accountsFixture }
      return null
    })

    const loader = getLoader('/protected/goals')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['goals'])).toEqual(goalsFixture)
    expect(queryClient.getQueryData(['accounts'])).toEqual(accountsFixture)
  })
})

// ---------------------------------------------------------------------------
// /debts
// ---------------------------------------------------------------------------
describe('/debts route loader', () => {
  it('prefetches debts under queryKey ["debts", false] with a boolean, not a string', async () => {
    setFetchMock((url) => {
      if (url === '/api/debts?settled=false') return { body: debtsFixture }
      return null
    })

    const loader = getLoader('/protected/debts')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['debts', false])).toEqual(debtsFixture)
    // Explicitly guard against the `'false'` (string) typo variant.
    expect(queryClient.getQueryData(['debts', 'false'])).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// /transactions
// ---------------------------------------------------------------------------
describe('/transactions route loader', () => {
  it('prefetches accounts, envelopes, and transactions (with empty-string search key) in parallel', async () => {
    setFetchMock((url) => {
      if (url === '/api/accounts') return { body: accountsFixture }
      if (url === '/api/envelopes') return { body: envelopesFixture }
      if (url === '/api/transactions') return { body: transactionsFixture }
      return null
    })

    const loader = getLoader('/protected/transactions')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['accounts'])).toEqual(accountsFixture)
    expect(queryClient.getQueryData(['envelopes'])).toEqual(envelopesFixture)
    expect(queryClient.getQueryData(['transactions', ''])).toEqual(transactionsFixture)
  })
})

// ---------------------------------------------------------------------------
// /settings
// ---------------------------------------------------------------------------
describe('/settings route loader', () => {
  it('prefetches the user profile under queryKey ["userProfile"]', async () => {
    setFetchMock((url) => {
      if (url === '/api/users/me') return { body: userProfileFixture }
      return null
    })

    const loader = getLoader('/protected/settings')
    await loader(makeLoaderContext())

    expect(queryClient.getQueryData(['userProfile'])).toEqual(userProfileFixture)
  })

  it('swallows a fetch failure instead of throwing/rejecting', async () => {
    setFetchRejects()

    const loader = getLoader('/protected/settings')
    let caught: unknown
    try {
      await loader(makeLoaderContext())
    } catch (e) {
      caught = e
    }
    expect(caught).toBeUndefined()
  })
})
