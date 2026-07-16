import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DebtsPage } from '../features/debts/DebtsPage'

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
const owedDebt = {
  id: 'debt-1',
  counterparty: 'Иван Петров',
  type: 'owed',
  amount: 500000, // 5000.00
  currency: 'RUB',
  settled: false,
  // Kept in the future relative to the test environment's clock: the edit
  // form's due-date input has a `min` of "today", so a past due date would
  // fail native HTML5 constraint validation and silently block submission.
  dueDate: '2030-06-15',
  note: 'За ремонт',
}

const owingDebt = {
  id: 'debt-2',
  counterparty: 'Мария Сидорова',
  type: 'owing',
  amount: 150000, // 1500.00
  currency: 'RUB',
  settled: false,
  dueDate: null,
  note: null,
}

const settledDebt = {
  id: 'debt-3',
  counterparty: 'Алексей Смирнов',
  type: 'owed',
  amount: 200000,
  currency: 'RUB',
  settled: true,
  dueDate: null,
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
// Helpers
// ---------------------------------------------------------------------------

// The two filter toggle controls. Only safe to call while no debt rows are
// rendered yet (e.g. immediately after `render()`, synchronously, before the
// mocked GET promise has resolved) — per-row controls (settle/delete are
// icon-only buttons whose accessible name comes from `aria-label`, and the
// row itself is an unlabeled clickable button) would otherwise pollute the
// result since they don't share any text/label with "Новый долг".
function getFilterButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => !/Новый долг/.test(b.textContent ?? ''))
}

// Clicks through the two filter buttons (without assuming which one is
// which) until a GET /debts?settled=true request has been observed.
// Returns the discovered button indices so callers can click back.
// `filterButtons` must be captured before any debt rows are rendered (see
// `getFilterButtons`) so the two elements are the actual filter toggles.
async function switchToSettledFilter(
  user: ReturnType<typeof userEvent.setup>,
  filterButtons: HTMLElement[],
): Promise<{ settledIndex: number; activeIndex: number }> {
  expect(filterButtons.length).toBe(2)

  vi.mocked(api.get).mockClear()
  await user.click(filterButtons[0])
  // The first click may be a no-op if filterButtons[0] happens to be the
  // already-active filter (clicking an already-selected filter shouldn't
  // change the query key), so tolerate a short timeout here before falling
  // back to the other button.
  try {
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=true'), { timeout: 300 })
    return { settledIndex: 0, activeIndex: 1 }
  } catch {
    // fall through
  }

  vi.mocked(api.get).mockClear()
  await user.click(filterButtons[1])
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=true'))
  return { settledIndex: 1, activeIndex: 0 }
}

// Finds the counterparty text input inside a dialog by id - it's no longer
// the only required textbox in the form (debt-currency still is), so a
// "find the required one" heuristic can no longer tell them apart.
function findCounterpartyInput(dialog: HTMLElement): HTMLElement {
  return dialog.querySelector('#debt-counterparty') as HTMLElement
}

// Finds the amount input inside a dialog by id - AmountField renders a
// type="text" input, so a role-based query can no longer distinguish it
// from the equally-required debt-currency textbox.
function findAmountInput(dialog: HTMLElement): HTMLElement {
  return dialog.querySelector('#debt-amount') as HTMLElement
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.put).mockReset()
  vi.mocked(api.delete).mockReset()
})

// ---------------------------------------------------------------------------
// Heading, create button, initial fetch
// ---------------------------------------------------------------------------
describe('DebtsPage heading and initial fetch', () => {
  it('renders a heading containing "Долги"', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: /Долги/ })
  })

  it('renders a button with accessible name "Новый долг"', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый долг' })
  })

  it('fetches unsettled debts on mount via GET /debts?settled=false', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))
  })

  it('renders two filter toggle controls', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))
    expect(getFilterButtons().length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('DebtsPage loading state', () => {
  it('shows no debt rows while the debts query is pending', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<DebtsPage />, { wrapper: createWrapper() })
    expect(screen.queryByText('Иван Петров')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Долги/ })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('DebtsPage empty state', () => {
  it('shows no debt rows/controls when the active filter list is empty', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))
    expect(screen.queryByRole('button', { name: 'Отметить погашенным' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить долг' })).not.toBeInTheDocument()
  })

  it('shows no debt rows when the settled filter list is empty', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/debts?settled=true') return Promise.resolve([])
      return Promise.resolve([owedDebt])
    })
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    // Capture the filter buttons synchronously, before the mocked GET
    // promise resolves and any debt rows (which also render as buttons) mount.
    const filterButtons = getFilterButtons()
    await screen.findByText('Иван Петров')

    await switchToSettledFilter(user, filterButtons)

    await waitFor(() => expect(screen.queryByText('Иван Петров')).not.toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Populated list
// ---------------------------------------------------------------------------
describe('DebtsPage with debts', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([owedDebt, owingDebt])
  })

  it('renders each debt counterparty name', async () => {
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    expect(screen.getByText('Мария Сидорова')).toBeInTheDocument()
  })

  it('renders formatted amounts for each debt', async () => {
    const { container } = render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await waitFor(() => expect(container.textContent).toMatch(/\d/))
  })

  it('renders a "Отметить погашенным" control for each unsettled debt', async () => {
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    const settleButtons = screen.getAllByRole('button', { name: 'Отметить погашенным' })
    expect(settleButtons.length).toBe(2)
  })

  it('renders a "Удалить долг" control for each debt', async () => {
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить долг' })
    expect(deleteButtons.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Settled debts hide the settle control
// ---------------------------------------------------------------------------
describe('DebtsPage settled debts', () => {
  it('does not show "Отметить погашенным" for a settled debt', async () => {
    vi.mocked(api.get).mockResolvedValue([settledDebt])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Алексей Смирнов')
    expect(screen.queryByRole('button', { name: 'Отметить погашенным' })).not.toBeInTheDocument()
  })

  it('still shows "Удалить долг" for a settled debt', async () => {
    vi.mocked(api.get).mockResolvedValue([settledDebt])
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Алексей Смирнов')
    expect(screen.getByRole('button', { name: 'Удалить долг' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Settle action
// ---------------------------------------------------------------------------
describe('DebtsPage settle action', () => {
  it('calls PUT /debts/{id} with { settled: true } when "Отметить погашенным" is activated', async () => {
    vi.mocked(api.get).mockResolvedValue([owedDebt])
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    await user.click(screen.getByRole('button', { name: 'Отметить погашенным' }))

    expect(api.put).toHaveBeenCalledWith('/debts/debt-1', { settled: true })
  })

  it('does not open the edit modal when the settle control is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([owedDebt])
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    await user.click(screen.getByRole('button', { name: 'Отметить погашенным' }))

    expect(screen.queryByRole('dialog', { name: 'Изменить долг' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Delete action
// ---------------------------------------------------------------------------
describe('DebtsPage delete action', () => {
  it('calls DELETE /debts/{id} when "Удалить долг" is activated', async () => {
    vi.mocked(api.get).mockResolvedValue([owedDebt])
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    await user.click(screen.getByRole('button', { name: 'Удалить долг' }))

    expect(api.delete).toHaveBeenCalledWith('/debts/debt-1')
  })

  it('does not open the edit modal when the delete control is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([owedDebt])
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    await user.click(screen.getByRole('button', { name: 'Удалить долг' }))

    expect(screen.queryByRole('dialog', { name: 'Изменить долг' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Filter toggle
// ---------------------------------------------------------------------------
describe('DebtsPage active/settled filter toggle', () => {
  it('clicking the settled filter re-fetches with GET /debts?settled=true', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    const filterButtons = getFilterButtons()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))

    await switchToSettledFilter(user, filterButtons)

    expect(vi.mocked(api.get).mock.calls.map((c) => c[0])).toContain('/debts?settled=true')
  })

  it('clicking back to the active filter re-fetches with GET /debts?settled=false', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    const filterButtons = getFilterButtons()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))

    const { activeIndex } = await switchToSettledFilter(user, filterButtons)

    vi.mocked(api.get).mockClear()
    await user.click(filterButtons[activeIndex])

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/debts?settled=false'))
  })
})

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------
describe('DebtsPage create flow', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([])
  })

  it('opens a "Новый долг" modal when the header button is clicked', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })
    expect(dialog).toBeInTheDocument()
  })

  it('the create form has an optional counterparty input (a placeholder covers it when blank), a type select offering owed/owing, a required amount input, a currency input defaulting to RUB, and a submit button', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    const nameInput = findCounterpartyInput(dialog)
    expect(nameInput).not.toBeRequired()

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('owed')
    expect(values).toContain('owing')

    const amountInput = findAmountInput(dialog)
    expect(amountInput).toBeRequired()

    expect(within(dialog).getByDisplayValue('RUB')).toBeInTheDocument()

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
  })

  it('has an optional "Срок" date field', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    const dueDateField = within(dialog).getByLabelText('Срок (необязательно)')
    expect(dueDateField).not.toBeNull()
    expect(dueDateField).not.toBeRequired()
  })

  it('submitting with counterparty and amount posts to /debts with the typed counterparty, selected type, and amount in minor units', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-debt' })
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    const nameInput = findCounterpartyInput(dialog)
    await user.type(nameInput, 'Иван Петров')

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    await user.selectOptions(select, 'owing')

    const amountInput = findAmountInput(dialog)
    await user.clear(amountInput)
    await user.type(amountInput, '50.25')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/debts')
    const b = body as Record<string, unknown>
    expect(b.counterparty).toBe('Иван Петров')
    expect(b.type).toBe('owing')
    expect(b.amount).toBe(5025)
    expect(Number.isInteger(b.amount)).toBe(true)
  })

  it('closes the modal on a successful POST', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-debt' })
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    const nameInput = findCounterpartyInput(dialog)
    await user.type(nameInput, 'Иван Петров')
    const amountInput = findAmountInput(dialog)
    await user.clear(amountInput)
    await user.type(amountInput, '100')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новый долг' })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------
describe('DebtsPage edit flow', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([owedDebt])
  })

  it('opens a "Изменить долг" modal pre-filled with the counterparty when the row is clicked', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    await user.click(screen.getByText('Иван Петров'))

    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })
    expect(within(dialog).getByDisplayValue('Иван Петров')).toBeInTheDocument()
  })

  it('submitting the unedited form calls PUT /debts/{id} with the same amount, converted back to integer minor units', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await user.click(screen.getByText('Иван Петров'))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.put).mock.calls[0]
    expect(path).toBe('/debts/debt-1')
    const b = body as Record<string, unknown>
    expect(Number.isInteger(b.amount)).toBe(true)
    expect(b.amount).toBe(owedDebt.amount)
  })

  it('reflects an edited counterparty name in the PUT body', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await user.click(screen.getByText('Иван Петров'))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })

    const nameInput = within(dialog).getByDisplayValue('Иван Петров')
    await user.clear(nameInput)
    await user.type(nameInput, 'Пётр Иванов')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.put).mock.calls[0]
    expect((body as Record<string, unknown>).counterparty).toBe('Пётр Иванов')
  })

  it('converts an edited decimal amount to integer minor units in the PUT body', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await user.click(screen.getByText('Иван Петров'))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })

    const amountInput = findAmountInput(dialog)
    await user.clear(amountInput)
    await user.type(amountInput, '12.34')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.put).mock.calls[0]
    expect((body as Record<string, unknown>).amount).toBe(1234)
  })

  it('calls PUT (not POST) when submitting the edit form', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await user.click(screen.getByText('Иван Петров'))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('closes the modal on a successful PUT', async () => {
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    await user.click(screen.getByText('Иван Петров'))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить долг' })
    expect(dialog).toBeInTheDocument()

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Изменить долг' })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// placeholderData: switching the settled/active filter keeps showing the
// previous list while the new one is still loading, then swaps once it
// arrives.
// ---------------------------------------------------------------------------
describe('DebtsPage keeps previous list visible while switching filters', () => {
  it('still shows the active list while the settled fetch is in flight, then swaps to the settled list once it resolves', async () => {
    // The initial (active) fetch resolves right away; the very next api.get
    // call (triggered by switching the filter) is left perpetually pending
    // until we manually resolve it below.
    let resolveSettled: (value: unknown) => void = () => {}
    const settledPromise = new Promise((resolve) => {
      resolveSettled = resolve
    })
    vi.mocked(api.get)
      .mockImplementationOnce(() => Promise.resolve([owedDebt]))
      .mockImplementationOnce(() => settledPromise)

    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    // Capture the filter buttons synchronously, before any debt rows mount.
    const filterButtons = getFilterButtons()
    await screen.findByText('Иван Петров')

    await switchToSettledFilter(user, filterButtons)

    // The settled fetch is still pending (never resolved) — the previously
    // loaded active-list content must remain on screen, not be cleared.
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()

    resolveSettled([settledDebt])

    await waitFor(() => expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument())
    expect(screen.queryByText('Иван Петров')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Arrow-key field navigation (handleArrowFieldNavigation wiring)
//
// handleArrowFieldNavigation (from @zudar107/schloss-ui) is attached to the
// <form>'s onKeyDown. This is a second data point (alongside
// AccountsPage.test.tsx) confirming kuvert wires it onto its forms and that
// focus lands on the expected fields in DOM order — the low-level arrow-key
// behavior itself is unit tested inside schloss-ui.
// ---------------------------------------------------------------------------
describe('DebtsPage create form arrow-key navigation', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([])
  })

  it('ArrowDown moves focus Контрагент -> Тип -> Сумма', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    const counterpartyField = findCounterpartyInput(dialog)
    const typeSelect = within(dialog).getByLabelText('Тип')
    const amountField = findAmountInput(dialog)

    await user.click(counterpartyField)
    expect(counterpartyField).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(typeSelect).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(amountField).toHaveFocus()
  })
})

// ---------------------------------------------------------------------------
// AmountField currency prefix follows the sibling "Валюта" field
// ---------------------------------------------------------------------------
describe('DebtsPage create form amount prefix follows currency', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([])
  })

  it('the "Сумма" prefix updates live from "₽" to "$" as the currency field is changed to USD', async () => {
    const user = userEvent.setup()
    render(<DebtsPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый долг' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый долг' })

    expect(within(dialog).getByText('₽')).toBeInTheDocument()

    const currencyField = within(dialog).getByLabelText('Валюта')
    await user.clear(currencyField)
    await user.type(currencyField, 'USD')

    expect(within(dialog).getByText('$')).toBeInTheDocument()
    expect(within(dialog).queryByText('₽')).not.toBeInTheDocument()
  })
})
