import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { formatAmount, formatDate, fromMinorUnits } from '../lib/format'

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
const accountRub = {
  id: 'acc-1',
  name: 'Основной счёт',
  type: 'checking',
  currency: 'RUB',
}

const accountSecond = {
  id: 'acc-2',
  name: 'Накопительный счёт',
  type: 'savings',
  currency: 'RUB',
}

const envelopeGroceries = {
  id: 'env-1',
  name: 'Продукты',
  icon: '🛒',
  color: '#4caf50',
}

const envelopeTransport = {
  id: 'env-2',
  name: 'Транспорт',
  icon: '🚌',
  color: '#2196f3',
}

const txExpense = {
  id: 'tx-1',
  type: 'expense',
  accountId: 'acc-1',
  envelopeId: 'env-1',
  amount: 150000, // 1500.00
  date: '2024-07-15',
  note: 'Покупки',
}

const txIncome = {
  id: 'tx-2',
  type: 'income',
  accountId: 'acc-1',
  envelopeId: null,
  amount: 500000, // 5000.00
  date: '2024-07-01',
  note: null,
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

// ---------------------------------------------------------------------------
// Default api.get implementation router
// ---------------------------------------------------------------------------
function mockApi(
  opts: {
    accounts?: Record<string, unknown>[]
    envelopes?: Record<string, unknown>[]
    transactions?: Record<string, unknown>[]
  } = {},
) {
  const accounts = opts.accounts ?? [accountRub, accountSecond]
  const envelopes = opts.envelopes ?? [envelopeGroceries, envelopeTransport]
  const transactions = opts.transactions ?? []
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/accounts') return Promise.resolve(accounts)
    if (path === '/envelopes') return Promise.resolve(envelopes)
    if (path.startsWith('/transactions')) return Promise.resolve(transactions)
    return Promise.reject(new Error(`Unexpected GET ${path}`))
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Finds, among a list of comboboxes, the one whose <option> values include
// every value in `values`.
function findSelectByOptionValues(
  combos: HTMLSelectElement[],
  values: string[],
): HTMLSelectElement | undefined {
  return combos.find((c) => values.every((v) => Array.from(c.options).some((o) => o.value === v)))
}

// Finds all comboboxes whose options include at least one of the given values
// (used to locate "account selecting" combos, of which there may be one or
// two depending on whether the form is in transfer mode).
function findSelectsWithAnyOptionValue(combos: HTMLSelectElement[], values: string[]): HTMLSelectElement[] {
  return combos.filter((c) => Array.from(c.options).some((o) => values.includes(o.value)))
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.put).mockReset()
  vi.mocked(api.delete).mockReset()
})

// ---------------------------------------------------------------------------
// Heading, initial fetches, create button
// ---------------------------------------------------------------------------
describe('TransactionsPage heading and initial fetches', () => {
  it('renders a heading containing "Транзакции"', async () => {
    mockApi()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: /Транзакции/ })
  })

  it('fetches accounts, envelopes, and transactions on mount', async () => {
    mockApi()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths).toContain('/accounts')
      expect(calledPaths).toContain('/envelopes')
      expect(calledPaths.some((p) => /^\/transactions(\?.*)?$/.test(p))).toBe(true)
    })
  })

  it('the initial transactions fetch has no filter query params', async () => {
    mockApi()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      const txCall = calledPaths.find((p) => p.startsWith('/transactions'))
      expect(txCall).toBeDefined()
      // Either no query string, or an empty one — but no filter params.
      expect(txCall).not.toMatch(/accountId=|envelopeId=|type=|dateFrom=|dateTo=/)
    })
  })

  it('renders a button with accessible name "Новая транзакция"', async () => {
    mockApi()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новая транзакция' })
  })
})

// ---------------------------------------------------------------------------
// "Новая транзакция" disabled when there are no accounts
// ---------------------------------------------------------------------------
describe('TransactionsPage create button account requirement', () => {
  it('disables "Новая транзакция" when there are no accounts', async () => {
    mockApi({ accounts: [] })
    render(<TransactionsPage />, { wrapper: createWrapper() })

    const button = await screen.findByRole('button', { name: 'Новая транзакция' })
    await waitFor(() => expect(button).toBeDisabled())
  })

  it('enables "Новая транзакция" when at least one account exists', async () => {
    mockApi({ accounts: [accountRub] })
    render(<TransactionsPage />, { wrapper: createWrapper() })

    const button = await screen.findByRole('button', { name: 'Новая транзакция' })
    await waitFor(() => expect(button).not.toBeDisabled())
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('TransactionsPage loading state', () => {
  it('renders no transaction rows while the transactions query is pending', () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/accounts') return Promise.resolve([accountRub])
      if (path === '/envelopes') return Promise.resolve([envelopeGroceries])
      return new Promise(() => {}) // transactions query never resolves
    })
    render(<TransactionsPage />, { wrapper: createWrapper() })

    expect(screen.queryByRole('button', { name: 'Удалить транзакцию' })).not.toBeInTheDocument()
    expect(screen.queryByText(formatDate(txExpense.date))).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('TransactionsPage empty state', () => {
  it('shows an empty state and no rows when there are accounts but no transactions', async () => {
    mockApi({ accounts: [accountRub], transactions: [] })
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/accounts'))
    // Give the transactions query a tick to settle.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Удалить транзакцию' })).not.toBeInTheDocument()
    })
    // Some informative empty-state content should be present (not asserting exact copy).
    expect(document.body.textContent).toMatch(/\S/)
  })

  it('shows no rows when there are zero accounts at all', async () => {
    mockApi({ accounts: [], transactions: [] })
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await screen.findByRole('button', { name: 'Новая транзакция' })
    expect(screen.queryByRole('button', { name: 'Удалить транзакцию' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Populated list
// ---------------------------------------------------------------------------
describe('TransactionsPage with transactions', () => {
  beforeEach(() => {
    mockApi({ transactions: [txExpense, txIncome] })
  })

  it('renders a formatted amount for each transaction, derived from formatAmount(amount, account currency)', async () => {
    const { container } = render(<TransactionsPage />, { wrapper: createWrapper() })

    await screen.findAllByRole('button', { name: 'Удалить транзакцию' })
    // Amount and date are rendered as sibling text nodes inside a shared
    // container (not their own isolated elements), so assert via the
    // container's full text rather than getByText/findByText equality.
    expect(container.textContent).toContain(formatAmount(txExpense.amount, accountRub.currency))
    expect(container.textContent).toContain(formatAmount(txIncome.amount, accountRub.currency))
  })

  it('renders a formatted date for each transaction, derived from formatDate(date)', async () => {
    const { container } = render(<TransactionsPage />, { wrapper: createWrapper() })

    await screen.findAllByRole('button', { name: 'Удалить транзакцию' })
    expect(container.textContent).toContain(formatDate(txExpense.date))
    expect(container.textContent).toContain(formatDate(txIncome.date))
  })

  it('renders a delete control labeled "Удалить транзакцию" for each transaction', async () => {
    render(<TransactionsPage />, { wrapper: createWrapper() })

    const deleteButtons = await screen.findAllByRole('button', { name: 'Удалить транзакцию' })
    expect(deleteButtons.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Delete action
// ---------------------------------------------------------------------------
describe('TransactionsPage delete action', () => {
  it('calls DELETE /transactions/{id} when the delete control is activated', async () => {
    mockApi({ transactions: [txExpense] })
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await screen.findByRole('button', { name: 'Удалить транзакцию' })
    await user.click(screen.getByRole('button', { name: 'Удалить транзакцию' }))

    expect(api.delete).toHaveBeenCalledWith('/transactions/tx-1')
  })
})

// ---------------------------------------------------------------------------
// Row click opens edit modal
// ---------------------------------------------------------------------------
describe('TransactionsPage edit-on-row-click', () => {
  beforeEach(() => {
    mockApi({ transactions: [txExpense] })
  })

  it('clicking the row (not the delete control) opens a modal titled "Изменить транзакцию"', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    // txExpense.note ("Покупки") renders as an isolated single-text-node
    // element, making it a stable click target for "the row's main content"
    // distinct from the delete control.
    await screen.findByText(txExpense.note)
    await user.click(screen.getByText(txExpense.note))

    const dialog = await screen.findByRole('dialog', { name: 'Изменить транзакцию' }, { timeout: 4000 })
    expect(dialog).toBeInTheDocument()
  })

  it('clicking the delete control does not open the edit modal', async () => {
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await screen.findByText(txExpense.note)
    await user.click(screen.getByRole('button', { name: 'Удалить транзакцию' }))

    expect(screen.queryByRole('dialog', { name: 'Изменить транзакцию' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------
describe('TransactionsPage filter controls', () => {
  it('renders comboboxes for account, envelope, and type, plus two date inputs', async () => {
    mockApi()
    const { container } = render(<TransactionsPage />, { wrapper: createWrapper() })

    let accountSelect: HTMLSelectElement | undefined
    let envelopeSelect: HTMLSelectElement | undefined
    let typeSelect: HTMLSelectElement | undefined

    await waitFor(() => {
      const combos = screen.getAllByRole('combobox') as HTMLSelectElement[]
      accountSelect = findSelectByOptionValues(combos, [accountRub.id, accountSecond.id])
      envelopeSelect = findSelectByOptionValues(combos, [envelopeGroceries.id, envelopeTransport.id])
      typeSelect = findSelectByOptionValues(combos, ['income', 'expense', 'transfer'])
      expect(accountSelect).toBeTruthy()
      expect(envelopeSelect).toBeTruthy()
      expect(typeSelect).toBeTruthy()
    })

    const dateInputs = container.querySelectorAll('input[type="date"]')
    expect(dateInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('selecting a specific account triggers a GET /transactions call whose query contains accountId=<id>', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    let accountSelect: HTMLSelectElement | undefined
    await waitFor(() => {
      const combos = screen.getAllByRole('combobox') as HTMLSelectElement[]
      accountSelect = findSelectByOptionValues(combos, [accountRub.id, accountSecond.id])
      expect(accountSelect).toBeTruthy()
    })

    vi.mocked(api.get).mockClear()
    await user.selectOptions(accountSelect as HTMLSelectElement, accountSecond.id)

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths.some((p) => p.includes(`accountId=${accountSecond.id}`))).toBe(true)
    })
  })

  it('selecting a specific envelope triggers a GET /transactions call whose query reflects that envelope', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    let envelopeSelect: HTMLSelectElement | undefined
    await waitFor(() => {
      const combos = screen.getAllByRole('combobox') as HTMLSelectElement[]
      envelopeSelect = findSelectByOptionValues(combos, [envelopeGroceries.id, envelopeTransport.id])
      expect(envelopeSelect).toBeTruthy()
    })

    vi.mocked(api.get).mockClear()
    await user.selectOptions(envelopeSelect as HTMLSelectElement, envelopeTransport.id)

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths.some((p) => p.startsWith('/transactions') && p.includes(envelopeTransport.id))).toBe(
        true,
      )
    })
  })

  it('selecting a specific type triggers a GET /transactions call whose query reflects that type', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    let typeSelect: HTMLSelectElement | undefined
    await waitFor(() => {
      const combos = screen.getAllByRole('combobox') as HTMLSelectElement[]
      typeSelect = findSelectByOptionValues(combos, ['income', 'expense', 'transfer'])
      expect(typeSelect).toBeTruthy()
    })

    vi.mocked(api.get).mockClear()
    await user.selectOptions(typeSelect as HTMLSelectElement, 'income')

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths.some((p) => p.startsWith('/transactions') && p.includes('income'))).toBe(true)
    })
  })

  it('setting the "date from" filter triggers a GET /transactions call reflecting that date', async () => {
    mockApi()
    const { container } = render(<TransactionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(container.querySelectorAll('input[type="date"]').length).toBeGreaterThanOrEqual(2)
    })

    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[]

    vi.mocked(api.get).mockClear()
    fireEvent.change(dateInputs[0], { target: { value: '2024-06-01' } })

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths.some((p) => p.startsWith('/transactions') && p.includes('2024-06-01'))).toBe(true)
    })
  })

  it('setting the "date to" filter triggers a GET /transactions call reflecting that date', async () => {
    mockApi()
    const { container } = render(<TransactionsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(container.querySelectorAll('input[type="date"]').length).toBeGreaterThanOrEqual(2)
    })

    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[]

    vi.mocked(api.get).mockClear()
    fireEvent.change(dateInputs[1], { target: { value: '2024-06-30' } })

    await waitFor(() => {
      const calledPaths = vi.mocked(api.get).mock.calls.map((c) => c[0])
      expect(calledPaths.some((p) => p.startsWith('/transactions') && p.includes('2024-06-30'))).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------
describe('TransactionsPage create flow', () => {
  beforeEach(() => {
    mockApi({ transactions: [] })
  })

  it('opens a "Новая транзакция" modal when the header button is clicked', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })
    expect(dialog).toBeInTheDocument()
  })

  it('the create form has a type selector, a required account selector, an optional envelope selector (non-transfer), a required amount input, a required date input, and a submit button', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })

    const combos = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const typeSelect = findSelectByOptionValues(combos, ['income', 'expense', 'transfer'])
    expect(typeSelect).toBeTruthy()

    const accountSelects = findSelectsWithAnyOptionValue(combos, [accountRub.id, accountSecond.id])
    expect(accountSelects.length).toBeGreaterThanOrEqual(1)
    expect(accountSelects[0]).toBeRequired()

    const envelopeSelect = findSelectByOptionValues(combos, [envelopeGroceries.id, envelopeTransport.id])
    expect(envelopeSelect).toBeTruthy()
    expect(envelopeSelect).not.toBeRequired()

    const amountInput = within(dialog).getAllByRole('spinbutton')[0]
    expect(amountInput).toBeRequired()

    const dateInput = dialog.querySelector('input[type="date"]')
    expect(dateInput).not.toBeNull()
    expect(dateInput).toBeRequired()

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
  })

  it('switching type to "transfer" reveals a second, distinct account-selecting combobox and hides the envelope selector', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })

    const combosBefore = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const accountSelectsBefore = findSelectsWithAnyOptionValue(combosBefore, [accountRub.id, accountSecond.id])
    expect(accountSelectsBefore.length).toBe(1)
    const sourceSelect = accountSelectsBefore[0]

    const typeSelect = findSelectByOptionValues(combosBefore, ['income', 'expense', 'transfer'])
    await user.selectOptions(typeSelect as HTMLSelectElement, 'transfer')

    await waitFor(() => {
      const combosAfter = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
      const accountSelectsAfter = findSelectsWithAnyOptionValue(combosAfter, [accountRub.id, accountSecond.id])
      expect(accountSelectsAfter.length).toBeGreaterThanOrEqual(2)
      expect(accountSelectsAfter).toContain(sourceSelect)

      const envelopeSelectAfter = findSelectByOptionValues(combosAfter, [
        envelopeGroceries.id,
        envelopeTransport.id,
      ])
      expect(envelopeSelectAfter).toBeUndefined()
    })
  })

  it('submitting with amount "25.50" posts amount 2550 (integer minor units) with matching type/accountId/date', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-tx' })
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })

    const combos = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const typeSelect = findSelectByOptionValues(combos, ['income', 'expense', 'transfer'])
    await user.selectOptions(typeSelect as HTMLSelectElement, 'expense')

    const accountSelects = findSelectsWithAnyOptionValue(combos, [accountRub.id, accountSecond.id])
    await user.selectOptions(accountSelects[0], accountRub.id)

    const amountInput = within(dialog).getAllByRole('spinbutton')[0]
    await user.clear(amountInput)
    await user.type(amountInput, '25.50')

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2024-07-20' } })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/transactions')
    const b = body as Record<string, unknown>
    expect(b.amount).toBe(2550)
    expect(Number.isInteger(b.amount)).toBe(true)
    expect(b.type).toBe('expense')
    expect(b.accountId).toBe(accountRub.id)
    expect(b.date).toBe('2024-07-20')
  })

  it('submitting a transfer form posts type "transfer" with distinct accountId and toAccountId', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-tx' })
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })

    const combosBefore = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const sourceSelect = findSelectsWithAnyOptionValue(combosBefore, [accountRub.id, accountSecond.id])[0]
    await user.selectOptions(sourceSelect, accountRub.id)

    const typeSelect = findSelectByOptionValues(combosBefore, ['income', 'expense', 'transfer'])
    await user.selectOptions(typeSelect as HTMLSelectElement, 'transfer')

    let destinationSelect: HTMLSelectElement | undefined
    await waitFor(() => {
      const combosAfter = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
      const accountSelectsAfter = findSelectsWithAnyOptionValue(combosAfter, [accountRub.id, accountSecond.id])
      expect(accountSelectsAfter.length).toBeGreaterThanOrEqual(2)
      destinationSelect = accountSelectsAfter.find((s) => s !== sourceSelect)
      expect(destinationSelect).toBeTruthy()
    })

    await user.selectOptions(destinationSelect as HTMLSelectElement, accountSecond.id)

    const amountInput = within(dialog).getAllByRole('spinbutton')[0]
    await user.clear(amountInput)
    await user.type(amountInput, '100')

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2024-07-20' } })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [, body] = vi.mocked(api.post).mock.calls[0]
    const b = body as Record<string, unknown>
    expect(b.type).toBe('transfer')
    expect(b.accountId).toBe(accountRub.id)
    expect(b.toAccountId).toBe(accountSecond.id)
    expect(b.accountId).not.toBe(b.toAccountId)
  })

  it('closes the modal on a successful POST', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-tx' })
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новая транзакция' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая транзакция' })

    const combos = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const accountSelects = findSelectsWithAnyOptionValue(combos, [accountRub.id, accountSecond.id])
    await user.selectOptions(accountSelects[0], accountRub.id)

    const amountInput = within(dialog).getAllByRole('spinbutton')[0]
    await user.clear(amountInput)
    await user.type(amountInput, '10')

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2024-07-20' } })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новая транзакция' })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------
describe('TransactionsPage edit flow', () => {
  beforeEach(() => {
    mockApi({ transactions: [txExpense] })
  })

  it('opens a "Изменить транзакцию" modal pre-filled with the amount when the row is clicked', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByText(txExpense.note)

    await user.click(screen.getByText(txExpense.note))

    const dialog = await screen.findByRole('dialog', { name: 'Изменить транзакцию' })
    expect(within(dialog).getByDisplayValue(String(fromMinorUnits(txExpense.amount)))).toBeInTheDocument()
  })

  it('submitting the unedited form calls PUT /transactions/{id} (not POST) with amount as integer minor units', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByText(txExpense.note)
    await user.click(screen.getByText(txExpense.note))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить транзакцию' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.post).not.toHaveBeenCalled()
    const [path, body] = vi.mocked(api.put).mock.calls[0]
    expect(path).toBe('/transactions/tx-1')
    const b = body as Record<string, unknown>
    expect(Number.isInteger(b.amount)).toBe(true)
    expect(b.amount).toBe(txExpense.amount)
  })

  it('converts an edited decimal amount to integer minor units in the PUT body', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByText(txExpense.note)
    await user.click(screen.getByText(txExpense.note))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить транзакцию' })

    const amountInput = within(dialog).getAllByRole('spinbutton')[0]
    await user.clear(amountInput)
    await user.type(amountInput, '12.34')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const [, body] = vi.mocked(api.put).mock.calls[0]
    expect((body as Record<string, unknown>).amount).toBe(1234)
  })

  it('closes the modal on a successful PUT', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TransactionsPage />, { wrapper: createWrapper() })
    await screen.findByText(txExpense.note)
    await user.click(screen.getByText(txExpense.note))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить транзакцию' })
    expect(dialog).toBeInTheDocument()

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Изменить транзакцию' })).not.toBeInTheDocument()
    })
  })
})
