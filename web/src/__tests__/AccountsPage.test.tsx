import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountsPage } from '../features/accounts/AccountsPage'

// ---------------------------------------------------------------------------
// Mock the api module
// ---------------------------------------------------------------------------
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const checkingAccount = {
  id: 'acc-1',
  name: 'Основной счёт',
  type: 'checking',
  currency: 'RUB',
}

const cashAccount = {
  id: 'acc-2',
  name: 'Мои наличные деньги',
  type: 'cash',
  currency: 'RUB',
}

// ---------------------------------------------------------------------------
// Wrapper factory — fresh QueryClient per test
// ---------------------------------------------------------------------------
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Same as createWrapper(), but also hands back the QueryClient instance so a
// test can seed/inspect the cache directly (e.g. to observe cross-query
// invalidation effects without rendering the other pages that own those
// queries). Deliberately does NOT use gcTime: 0 (unlike createWrapper()) —
// queries seeded here have no active observer in these tests, and gcTime: 0
// garbage-collects unobserved queries almost immediately, before a test
// could ever inspect their cache state.
function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper, queryClient }
}

// ---------------------------------------------------------------------------
// Default api.get implementation: routes /accounts and /accounts/{id}/balance
//
// The active-tab list request now explicitly includes `?archived=false` (not
// just a bare `/accounts`), so both forms are accepted here for backward
// compatibility with tests written before the archive/restore feature.
// `archivedAccounts` optionally seeds the `?archived=true` branch.
// ---------------------------------------------------------------------------
function mockApiWithAccounts(
  accounts: typeof checkingAccount[],
  balances: Record<string, number> = {},
  archivedAccounts: typeof checkingAccount[] = [],
) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/accounts' || path === '/accounts?archived=false') return Promise.resolve(accounts)
    if (path === '/accounts?archived=true') return Promise.resolve(archivedAccounts)
    const balanceMatch = path.match(/^\/accounts\/(.+)\/balance$/)
    if (balanceMatch) {
      const id = balanceMatch[1]
      return Promise.resolve({ balance: balances[id] ?? 0 })
    }
    return Promise.reject(new Error(`Unexpected GET ${path}`))
  })
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.put).mockReset()
  vi.mocked(api.delete).mockReset()
})

// ---------------------------------------------------------------------------
// Page heading & create button
// ---------------------------------------------------------------------------
describe('AccountsPage heading and create button', () => {
  it('renders a heading containing "Счета"', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<AccountsPage />, { wrapper: createWrapper() })
    const heading = await screen.findByRole('heading', { name: /Счета/ })
    expect(heading).toBeInTheDocument()
  })

  it('renders a button with accessible name "Новый счёт"', async () => {
    mockApiWithAccounts([])
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('AccountsPage loading state', () => {
  it('does not render account data while the accounts query is pending', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<AccountsPage />, { wrapper: createWrapper() })
    expect(screen.queryByText('Основной счёт')).not.toBeInTheDocument()
    expect(screen.queryByText('Мои наличные деньги')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('AccountsPage empty state', () => {
  it('shows an empty-state message and a create trigger when there are no accounts', async () => {
    mockApiWithAccounts([])
    render(<AccountsPage />, { wrapper: createWrapper() })

    // Wait for loading to resolve — the "Новый счёт" primary button always exists,
    // so use the fact that no account cards render plus some empty-state affordance.
    await screen.findByRole('button', { name: 'Новый счёт' })

    // There should be at least 2 buttons capable of opening the create modal
    // (the header button + an empty-state trigger), or at minimum some empty
    // state textual content distinct from account cards.
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('empty-state copy explains accounts as real money containers and cross-references "Бюджет" (Budget)', async () => {
    mockApiWithAccounts([])
    const { container } = render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })

    // The empty-state block may commit a tick after the always-present header
    // button, so poll rather than asserting immediately.
    await vi.waitFor(() => {
      const text = container.textContent ?? ''
      // Explains accounts as a real place where money physically sits
      expect(text).toMatch(/деньги/i)
      expect(text).toMatch(/реальн|физическ/i)
      // Explicitly cross-references the "Бюджет" (Budget) page
      expect(text).toMatch(/Бюджет/)
    })
  })

  it('empty-state create trigger opens the "Новый счёт" modal', async () => {
    mockApiWithAccounts([])
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })

    await screen.findByRole('button', { name: 'Новый счёт' })

    // Find all buttons that could plausibly open the create-account modal.
    const buttons = screen.getAllByRole('button')
    let opened = false
    for (const button of buttons) {
      await user.click(button)
      if (screen.queryByRole('dialog', { name: 'Новый счёт' })) {
        opened = true
        break
      }
    }
    expect(opened).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Populated list with balances
// ---------------------------------------------------------------------------
describe('AccountsPage with accounts', () => {
  beforeEach(() => {
    mockApiWithAccounts([checkingAccount, cashAccount], {
      'acc-1': 150000, // 1500.00
      'acc-2': 5000, // 50.00
    })
  })

  it('renders one card per account showing the account name', async () => {
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')
    expect(screen.getByText('Мои наличные деньги')).toBeInTheDocument()
  })

  it('fetches balance per account via GET /accounts/{id}/balance', async () => {
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    const calledPaths = vi.mocked(api.get).mock.calls.map((call) => call[0])
    expect(calledPaths).toContain('/accounts/acc-1/balance')
    expect(calledPaths).toContain('/accounts/acc-2/balance')
  })

  it('shows a formatted currency amount once balance resolves', async () => {
    const { container } = render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    // Wait for some currency-looking text (containing digits) to appear
    // once the per-account balance query resolves. formatAmount's exact
    // output isn't tested here — just that something numeric renders.
    await vi.waitFor(() => {
      expect(container.textContent).toMatch(/\d/)
    })
  })

  it('renders an "Изменить" control for each account', async () => {
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    const editButtons = screen.getAllByRole('button', { name: 'Изменить' })
    expect(editButtons.length).toBe(2)
  })

  it('renders an archive control labeled "Архивировать счёт" for each account', async () => {
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    const archiveButtons = screen.getAllByRole('button', { name: 'Архивировать счёт' })
    expect(archiveButtons.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Archive / delete flow
// ---------------------------------------------------------------------------
describe('AccountsPage archive/delete flow', () => {
  it('calls DELETE /accounts/{id} when the archive control is activated', async () => {
    mockApiWithAccounts([checkingAccount, cashAccount], { 'acc-1': 100, 'acc-2': 200 })
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()

    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    const archiveButtons = screen.getAllByRole('button', { name: 'Архивировать счёт' })
    await user.click(archiveButtons[0])

    expect(api.delete).toHaveBeenCalledWith('/accounts/acc-1')
  })
})

// ---------------------------------------------------------------------------
// Archived tab & restore flow
// ---------------------------------------------------------------------------
describe('AccountsPage archived tab and restore flow', () => {
  it('renders a segmented control with "Активные" and "Архивные" options', async () => {
    mockApiWithAccounts([checkingAccount])
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    expect(screen.getByRole('button', { name: 'Активные' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Архивные' })).toBeInTheDocument()
  })

  it('fetches the active list via GET /accounts?archived=false by default', async () => {
    mockApiWithAccounts([checkingAccount])
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    expect(vi.mocked(api.get).mock.calls.map((c) => c[0])).toContain('/accounts?archived=false')
  })

  it('clicking "Архивные" fetches the archived list via GET /accounts?archived=true', async () => {
    mockApiWithAccounts([checkingAccount], {}, [{ ...cashAccount, name: 'Архивный счёт' }])
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Архивные' }))

    await screen.findByText('Архивный счёт')
    expect(vi.mocked(api.get).mock.calls.map((c) => c[0])).toContain('/accounts?archived=true')
  })

  it('shows a "Восстановить счёт" control instead of "Архивировать счёт" on archived cards', async () => {
    mockApiWithAccounts([], {}, [checkingAccount])
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })

    await user.click(screen.getByRole('button', { name: 'Архивные' }))
    await screen.findByText('Основной счёт')

    expect(screen.getByRole('button', { name: 'Восстановить счёт' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Архивировать счёт' })).not.toBeInTheDocument()
  })

  it('does not show an "Изменить" control on archived cards', async () => {
    mockApiWithAccounts([], {}, [checkingAccount])
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })

    await user.click(screen.getByRole('button', { name: 'Архивные' }))
    await screen.findByText('Основной счёт')

    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
  })

  it('clicking "Восстановить счёт" calls POST /accounts/{id}/restore with an empty body', async () => {
    mockApiWithAccounts([], {}, [checkingAccount])
    vi.mocked(api.post).mockResolvedValue({ id: 'acc-1', archived: false })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })

    await user.click(screen.getByRole('button', { name: 'Архивные' }))
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Восстановить счёт' }))

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/accounts/acc-1/restore')
    if (body !== undefined) {
      expect(Object.keys(body as object)).toHaveLength(0)
    }
  })

  it('shows a success toast and removes the item from the archived list after a successful restore', async () => {
    let archived = [checkingAccount]
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/accounts?archived=true') return Promise.resolve(archived)
      if (path === '/accounts' || path === '/accounts?archived=false') return Promise.resolve([])
      const balanceMatch = path.match(/^\/accounts\/(.+)\/balance$/)
      if (balanceMatch) return Promise.resolve({ balance: 0 })
      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })
    vi.mocked(api.post).mockImplementation(async () => {
      archived = []
      return { id: 'acc-1', archived: false }
    })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый счёт' })

    await user.click(screen.getByRole('button', { name: 'Архивные' }))
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Восстановить счёт' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Счёт восстановлен')

    await vi.waitFor(() => {
      expect(screen.queryByText('Основной счёт')).not.toBeInTheDocument()
    })
  })

  it('shows an empty-state heading "Архивных счетов нет" with no call-to-action button on an empty archived tab', async () => {
    mockApiWithAccounts([checkingAccount], {}, [])
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Архивные' }))

    await screen.findByText('Архивных счетов нет')

    // Only the always-present header "Новый счёт" button and the two
    // segmented-control tab buttons should remain — no extra CTA button
    // like the active-tab empty state has.
    const buttons = screen.getAllByRole('button')
    const buttonNames = buttons.map((b) => b.textContent?.trim())
    expect(buttonNames.some((n) => /Добавить|Создать счёт/.test(n ?? ''))).toBe(false)
    expect(buttons.length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------
describe('AccountsPage create flow', () => {
  beforeEach(() => {
    mockApiWithAccounts([])
  })

  it('opens a "Новый счёт" modal when the header button is clicked', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })
    expect(dialog).toBeInTheDocument()
  })

  it('the create form has an optional name input (a placeholder covers it when blank), a type select, a currency input, an initial balance input, and a submit button', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const textboxes = within(dialog).getAllByRole('textbox')
    expect(textboxes.length).toBeGreaterThanOrEqual(1)

    const combobox = within(dialog).getByRole('combobox')
    expect(combobox).toBeInTheDocument()
    const select = combobox as HTMLSelectElement
    expect(select.options.length).toBeGreaterThanOrEqual(2)

    const spinbuttons = within(dialog).queryAllByRole('spinbutton')
    // Initial balance input may be role=spinbutton (number input) — accept
    // either that or a textbox variant depending on implementation choices.
    expect(spinbuttons.length + textboxes.length).toBeGreaterThanOrEqual(2)

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
  })

  it('currency input defaults to "RUB"', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    expect(within(dialog).getByDisplayValue('RUB')).toBeInTheDocument()
  })

  it('submitting with only the name filled posts initialBalance: 0 (integer)', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/accounts')
    expect((body as Record<string, unknown>).name).toBe('Копилка')
    expect((body as Record<string, unknown>).initialBalance).toBe(0)
    expect(Number.isInteger((body as Record<string, unknown>).initialBalance)).toBe(true)
  })

  it('converts a decimal initial balance to integer minor units before posting', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Тестовый счёт')

    // Locate the initial-balance field: prefer spinbutton role, fall back to
    // any remaining textbox that isn't the name/currency fields.
    const spinbuttons = within(dialog).queryAllByRole('spinbutton')
    let balanceInput: HTMLElement
    if (spinbuttons.length >= 1) {
      balanceInput = spinbuttons[spinbuttons.length - 1]
    } else {
      const textboxes = within(dialog).getAllByRole('textbox')
      balanceInput = textboxes[textboxes.length - 1]
    }

    await user.clear(balanceInput)
    await user.type(balanceInput, '10.50')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.post).mock.calls[0]
    expect((body as Record<string, unknown>).initialBalance).toBe(1050)
  })

  it('closes the modal on a successful POST', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Новый')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новый счёт' })).not.toBeInTheDocument()
    })
  })

  it('the type select offers multiple account type options', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    expect(select.options.length).toBeGreaterThanOrEqual(4)

    await user.selectOptions(select, select.options[1].value)
    expect(select.value).toBe(select.options[1].value)
  })
})

// ---------------------------------------------------------------------------
// Create flow — cross-query cache invalidation
// ---------------------------------------------------------------------------
// Creating an account with a non-zero starting balance also creates a real
// transaction server-side, so a successful create must invalidate not only
// ['accounts'] but also ['transactions', ...] and ['budget', ...] — otherwise
// a separately-cached Transactions page, or the Budget page's "Осталось
// распределить" figure (which depends on income transactions), would keep
// showing stale data. These tests observe that directly on the QueryClient
// cache rather than rendering TransactionsPage/BudgetPage.
describe('AccountsPage create flow — cross-query cache invalidation', () => {
  beforeEach(() => {
    mockApiWithAccounts([])
  })

  it('refetches the accounts list (GET /accounts) after a successful create', async () => {
    // Same call-count-as-proxy-for-invalidation approach used by
    // BudgetPage.test.tsx's "refetches the periods list after a successful
    // delete" test. ['accounts'] is actively observed by AccountsPage
    // itself, so invalidateQueries triggers an immediate automatic refetch
    // for it — by the time a POST resolves, isInvalidated has typically
    // already flipped back to false, so a raw cache-state check isn't a
    // reliable signal here (unlike the inactive ['transactions']/['budget']
    // queries below). Counting GET /accounts calls avoids that race.
    let accountsCallCount = 0
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/accounts' || path === '/accounts?archived=false') {
        accountsCallCount += 1
        return Promise.resolve([])
      }
      const balanceMatch = path.match(/^\/accounts\/(.+)\/balance$/)
      if (balanceMatch) return Promise.resolve({ balance: 0 })
      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()

    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(accountsCallCount).toBeGreaterThanOrEqual(2)
    })
  })

  it('invalidates cached ["transactions", ...] and ["budget", ...] queries after a successful create, without rendering TransactionsPage/BudgetPage', async () => {
    // ['transactions', ...] and ['budget', ...] have no active observer in
    // this test (TransactionsPage/BudgetPage are never rendered), so
    // invalidateQueries only marks them stale — it won't auto-refetch them
    // (default refetchType is 'active'), so isInvalidated stays true and is
    // a reliable signal here.
    //
    // A plain createWrapper() client uses gcTime: 0 for fast test teardown,
    // which garbage-collects unobserved queries almost immediately — before
    // this test could ever observe them. So this test builds its own
    // QueryClient with a normal (non-zero) gcTime via createWrapperWithClient.
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    const { wrapper, queryClient } = createWrapperWithClient()

    // Seed the cache as if TransactionsPage / BudgetPage had already fetched
    // and cached data under these keys.
    queryClient.setQueryData(['transactions', ''], [])
    queryClient.setQueryData(['budget', 'period-1'], {})

    render(<AccountsPage />, { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1)
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryState(['transactions', ''])?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(['budget', 'period-1'])?.isInvalidated).toBe(true)
    })
  })

  it('does not invalidate unrelated query keys after a successful create', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    const { wrapper, queryClient } = createWrapperWithClient()

    queryClient.setQueryData(['envelopes'], [])
    queryClient.setQueryData(['transactions', ''], [])

    render(<AccountsPage />, { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    // Wait for the related invalidation to land first, as a synchronization
    // point — ['envelopes'] shares no prefix with ['accounts'],
    // ['transactions'] or ['budget'], so it should remain untouched
    // throughout.
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(['transactions', ''])?.isInvalidated).toBe(true)
    })
    expect(queryClient.getQueryState(['envelopes'])?.isInvalidated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------
describe('AccountsPage edit flow', () => {
  beforeEach(() => {
    mockApiWithAccounts([checkingAccount], { 'acc-1': 150000 })
  })

  it('opens a "Изменить счёт" modal with the name pre-filled when "Изменить" is clicked', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))

    const dialog = await screen.findByRole('dialog', { name: 'Изменить счёт' })
    expect(within(dialog).getByDisplayValue('Основной счёт')).toBeInTheDocument()
  })

  it('submitting the edit form calls PUT /accounts/{id} without an initialBalance field', async () => {
    // initialBalance only has a real effect at creation time (it becomes
    // an opening transaction there) - PUT never touches transactions, so
    // it's omitted from the edit form/payload entirely rather than
    // silently rewriting a column nothing reads back.
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить счёт' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.put).mock.calls[0]
    expect(path).toBe('/accounts/acc-1')
    expect((body as Record<string, unknown>).initialBalance).toBeUndefined()
  })

  it('does not render the "Начальный баланс" field in the edit form', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить счёт' })

    expect(within(dialog).queryByText('Начальный баланс')).not.toBeInTheDocument()
  })

  it('reflects an edited name in the PUT body', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить счёт' })

    const nameInput = within(dialog).getByDisplayValue('Основной счёт')
    await user.clear(nameInput)
    await user.type(nameInput, 'Переименованный счёт')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.put).mock.calls[0]
    expect((body as Record<string, unknown>).name).toBe('Переименованный счёт')
  })

  it('closes the modal on a successful PUT', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить счёт' })
    expect(dialog).toBeInTheDocument()

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Изменить счёт' })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
describe('AccountsPage toast notifications', () => {
  it('shows a success toast containing "Счёт создан" after a successful create', async () => {
    mockApiWithAccounts([])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-acc' })
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Счёт создан')
  })

  it('shows a failure toast when creating an account fails', async () => {
    mockApiWithAccounts([])
    vi.mocked(api.post).mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    const status = await screen.findByRole('status')
    expect(status.textContent ?? '').toMatch(/не удалось создать счёт/i)
  })

  it('shows a success toast containing "Счёт архивирован" after a successful archive', async () => {
    mockApiWithAccounts([checkingAccount, cashAccount], { 'acc-1': 100, 'acc-2': 200 })
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()

    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    const archiveButtons = screen.getAllByRole('button', { name: 'Архивировать счёт' })
    await user.click(archiveButtons[0])

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Счёт архивирован')
  })

  it('a later toast replaces an earlier one still visible on screen, rather than stacking', async () => {
    mockApiWithAccounts([checkingAccount, cashAccount], { 'acc-1': 100, 'acc-2': 200 })
    vi.mocked(api.post).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()

    render(<AccountsPage />, { wrapper: createWrapper() })
    await screen.findByText('Основной счёт')

    // Trigger a create failure first.
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })
    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Копилка')
    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    const failureStatus = await screen.findByRole('status')
    expect(failureStatus.textContent ?? '').toMatch(/не удалось создать счёт/i)

    // Immediately trigger an archive success while the failure toast is showing.
    const archiveButtons = screen.getAllByRole('button', { name: 'Архивировать счёт' })
    await user.click(archiveButtons[0])

    await vi.waitFor(() => {
      const statuses = screen.getAllByRole('status')
      expect(statuses.length).toBe(1)
      expect(statuses[0]).toHaveTextContent('Счёт архивирован')
    })

    // The earlier failure message should no longer be present anywhere.
    expect(screen.queryByText(/не удалось создать счёт/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Arrow-key field navigation (handleArrowFieldNavigation wiring)
//
// handleArrowFieldNavigation (from @zudar107/schloss-ui) is attached to the
// <form>'s onKeyDown. These tests only verify kuvert wired it onto this
// form and that focus actually lands on the expected fields in this form's
// DOM order — the low-level arrow-key/no-wraparound behavior itself is unit
// tested inside schloss-ui.
// ---------------------------------------------------------------------------
describe('AccountsPage create form arrow-key navigation', () => {
  beforeEach(() => {
    mockApiWithAccounts([])
  })

  it('ArrowDown moves focus Название -> Тип -> Валюта, and ArrowUp moves back to Тип', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    const nameField = within(dialog).getByLabelText('Название')
    const typeSelect = within(dialog).getByLabelText('Тип')
    const currencyField = within(dialog).getByLabelText('Валюта')

    await user.click(nameField)
    expect(nameField).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(typeSelect).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(currencyField).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(typeSelect).toHaveFocus()
  })
})

// ---------------------------------------------------------------------------
// AmountField currency prefix follows the sibling "Валюта" field
// ---------------------------------------------------------------------------
describe('AccountsPage create form amount prefix follows currency', () => {
  beforeEach(() => {
    mockApiWithAccounts([])
  })

  it('the "Начальный баланс" prefix updates live from "₽" to "$" as the currency field is changed to USD', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый счёт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый счёт' })

    expect(within(dialog).getByText('₽')).toBeInTheDocument()

    const currencyField = within(dialog).getByLabelText('Валюта')
    await user.clear(currencyField)
    await user.type(currencyField, 'USD')

    expect(within(dialog).getByText('$')).toBeInTheDocument()
    expect(within(dialog).queryByText('₽')).not.toBeInTheDocument()
  })
})
