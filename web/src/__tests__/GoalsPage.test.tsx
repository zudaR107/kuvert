import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoalsPage } from '../features/goals/GoalsPage'

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
const activeGoal = {
  id: 'goal-1',
  name: 'Отпуск',
  icon: '✈️',
  color: '#2196f3',
  targetAmount: 100000,
  currentAmount: 40000,
  deadline: '2024-12-31',
  recurring: false,
  monthlyNeeded: 10000,
}

const completedGoal = {
  id: 'goal-2',
  name: 'Ноутбук',
  icon: '💻',
  color: '#4caf50',
  targetAmount: 80000,
  currentAmount: 80000, // reached target
  deadline: null,
  recurring: false,
  monthlyNeeded: null,
}

const goalWithoutMonthly = {
  id: 'goal-3',
  name: 'Резервный фонд',
  icon: '🏦',
  color: '#ff9800',
  targetAmount: 50000,
  currentAmount: 10000,
  deadline: null,
  recurring: false,
  monthlyNeeded: null, // no deadline → no monthly suggestion
}

// Accounts fixture used by the goal-contribution modal (fetched via GET /accounts)
const mockAccounts = [
  { id: 'acc-1', name: 'Основной счёт', type: 'checking', currency: 'RUB' },
  { id: 'acc-2', name: 'Наличные', type: 'cash', currency: 'RUB' },
]

// Routes GET /accounts to the accounts fixture and any other path (goals list)
// to the provided goals array — mirrors the blanket-mock convention used
// elsewhere in this file while still letting the contribute-modal tests see
// a distinct accounts list.
function mockApiForGoals(goals: unknown[]) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/accounts') return Promise.resolve(mockAccounts)
    return Promise.resolve(goals)
  })
}

// ---------------------------------------------------------------------------
// Wrapper factory — fresh QueryClient per test
// ---------------------------------------------------------------------------
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
})

// ---------------------------------------------------------------------------
// Page title
// ---------------------------------------------------------------------------
describe('GoalsPage title', () => {
  it('always renders the page title "Цели"', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<GoalsPage />, { wrapper: createWrapper() })
    expect(screen.getByText('Цели')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Loading / skeleton state
// ---------------------------------------------------------------------------
describe('GoalsPage loading state', () => {
  it('shows skeleton and not the empty state while loading', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<GoalsPage />, { wrapper: createWrapper() })

    // While loading, the empty-state text must not appear
    expect(screen.queryByText('Целей пока нет')).not.toBeInTheDocument()
    // The page title is still visible
    expect(screen.getByText('Цели')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('GoalsPage empty state', () => {
  it('shows "Целей пока нет" when the query returns an empty array', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Целей пока нет')
  })

  it('shows 0 active goals count when empty', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    render(<GoalsPage />, { wrapper: createWrapper() })
    // The count paragraph says "{goals.length} активных целей"
    await screen.findByText(/0 активных целей/)
  })
})

// ---------------------------------------------------------------------------
// Goals rendered
// ---------------------------------------------------------------------------
describe('GoalsPage with goals', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([activeGoal, completedGoal])
  })

  it('renders goal card names', async () => {
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    expect(screen.getByText('Ноутбук')).toBeInTheDocument()
  })

  it('shows correct active goals count', async () => {
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText(/2 активных целей/)
  })

  it('does not show empty state when goals exist', async () => {
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    expect(screen.queryByText('Целей пока нет')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// "Достигнуто ✓" badge
// ---------------------------------------------------------------------------
describe('GoalsPage "Достигнуто" badge', () => {
  it('shows "Достигнуто ✓" when currentAmount >= targetAmount', async () => {
    vi.mocked(api.get).mockResolvedValue([completedGoal])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText(/Достигнуто/)
    expect(screen.getByText(/Достигнуто/)).toBeInTheDocument()
  })

  it('does not show "Достигнуто ✓" for an incomplete goal', async () => {
    vi.mocked(api.get).mockResolvedValue([activeGoal])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    expect(screen.queryByText(/Достигнуто/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// "Рекомендуется в месяц" section
// ---------------------------------------------------------------------------
describe('GoalsPage monthly recommendation', () => {
  it('shows "Рекомендуется в месяц" when monthlyNeeded is set and goal is not done', async () => {
    vi.mocked(api.get).mockResolvedValue([activeGoal]) // monthlyNeeded: 10000, not done
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Рекомендуется в месяц')
  })

  it('does not show "Рекомендуется в месяц" when monthlyNeeded is null', async () => {
    vi.mocked(api.get).mockResolvedValue([goalWithoutMonthly])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Резервный фонд')
    expect(screen.queryByText('Рекомендуется в месяц')).not.toBeInTheDocument()
  })

  it('does not show "Рекомендуется в месяц" when the goal is completed', async () => {
    // completedGoal has monthlyNeeded: null and is done
    vi.mocked(api.get).mockResolvedValue([completedGoal])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Ноутбук')
    expect(screen.queryByText('Рекомендуется в месяц')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Progress bar presence
// ---------------------------------------------------------------------------
describe('GoalsPage progress bars', () => {
  it('renders a progress bar for each goal card', async () => {
    vi.mocked(api.get).mockResolvedValue([activeGoal, completedGoal])
    const { container } = render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    const progressBars = container.querySelectorAll('.progress-bar')
    expect(progressBars.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Create-goal modal (new behaviour)
// ---------------------------------------------------------------------------
describe('GoalsPage create-goal modal', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
  })

  it('opens a "Новая цель" modal when the header button is clicked', async () => {
    mockApiForGoals([activeGoal])
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')

    await user.click(screen.getByRole('button', { name: 'Новая цель' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })
    expect(dialog).toBeInTheDocument()
  })

  it('opens the same modal via the empty-state "Создать первую цель" button', async () => {
    mockApiForGoals([])
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Целей пока нет')

    await user.click(screen.getByRole('button', { name: 'Создать первую цель' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })
    expect(dialog).toBeInTheDocument()
  })

  it('the form has a required name textbox, a required target-amount input, an optional deadline date input, a recurring checkbox, and a submit button', async () => {
    mockApiForGoals([activeGoal])
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Новая цель' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })

    const textboxes = within(dialog).getAllByRole('textbox')
    const requiredTextbox = textboxes.find((t) => t.hasAttribute('required'))
    expect(requiredTextbox).toBeDefined()

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const requiredSpin = spinbuttons.find((s) => s.hasAttribute('required'))
    expect(requiredSpin).toBeDefined()

    const checkbox = within(dialog).getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()

    const dateInput = dialog.querySelector('input[type="date"]')
    expect(dateInput).not.toBeNull()
    expect(dateInput).not.toBeRequired()

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
  })

  it('submitting with name and target amount (recurring unchecked) posts targetAmount in minor units, recurring: false, and recurringDay: null', async () => {
    mockApiForGoals([activeGoal])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-goal' })
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Новая цель' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })

    const textboxes = within(dialog).getAllByRole('textbox')
    const nameInput = textboxes.find((t) => t.hasAttribute('required')) ?? textboxes[0]
    await user.type(nameInput, 'Машина')

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const amountInput = spinbuttons.find((s) => s.hasAttribute('required')) ?? spinbuttons[0]
    await user.clear(amountInput)
    await user.type(amountInput, '150.75')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/goals')
    const b = body as Record<string, unknown>
    expect(b.name).toBe('Машина')
    expect(b.targetAmount).toBe(15075)
    expect(Number.isInteger(b.targetAmount)).toBe(true)
    expect(b.recurring).toBe(false)
    expect(b.recurringDay).toBeNull()
  })

  it('checking the recurring checkbox and submitting posts recurring: true with a non-null integer recurringDay', async () => {
    mockApiForGoals([activeGoal])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-goal' })
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Новая цель' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })

    const textboxes = within(dialog).getAllByRole('textbox')
    const nameInput = textboxes.find((t) => t.hasAttribute('required')) ?? textboxes[0]
    await user.type(nameInput, 'Отпуск на море')

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const amountInput = spinbuttons.find((s) => s.hasAttribute('required')) ?? spinbuttons[0]
    await user.clear(amountInput)
    await user.type(amountInput, '500')

    const checkbox = within(dialog).getByRole('checkbox')
    await user.click(checkbox)

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.post).mock.calls[0]
    const b = body as Record<string, unknown>
    expect(b.recurring).toBe(true)
    expect(b.recurringDay).not.toBeNull()
    expect(Number.isInteger(b.recurringDay)).toBe(true)
  })

  it('closes the create modal on a successful POST', async () => {
    mockApiForGoals([activeGoal])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-goal' })
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Новая цель' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новая цель' })

    const textboxes = within(dialog).getAllByRole('textbox')
    const nameInput = textboxes.find((t) => t.hasAttribute('required')) ?? textboxes[0]
    await user.type(nameInput, 'Машина')

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const amountInput = spinbuttons.find((s) => s.hasAttribute('required')) ?? spinbuttons[0]
    await user.clear(amountInput)
    await user.type(amountInput, '1000')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новая цель' })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Contribute-to-goal modal (new behaviour)
// ---------------------------------------------------------------------------
describe('GoalsPage contribute flow', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
  })

  it('shows a "Пополнить" button for an incomplete goal', async () => {
    mockApiForGoals([activeGoal])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    screen.getByRole('button', { name: 'Пополнить' })
  })

  it('does not show a "Пополнить" button for a completed goal', async () => {
    mockApiForGoals([completedGoal])
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Ноутбук')
    expect(screen.queryByRole('button', { name: 'Пополнить' })).not.toBeInTheDocument()
  })

  it('clicking "Пополнить" opens a modal whose title contains the goal\'s name', async () => {
    mockApiForGoals([activeGoal])
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')

    await user.click(screen.getByRole('button', { name: 'Пополнить' }))

    const dialog = await screen.findByRole('dialog', { name: /Отпуск/ })
    expect(dialog).toBeInTheDocument()
  })

  it('the contribution form has a required account select (populated from GET /accounts), a required amount input, a required date input, an optional note input, and a submit button', async () => {
    mockApiForGoals([activeGoal])
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Пополнить' }))
    const dialog = await screen.findByRole('dialog', { name: /Отпуск/ })

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    expect(select).toBeRequired()
    await vi.waitFor(() => {
      expect(select.options.length).toBeGreaterThanOrEqual(mockAccounts.length)
    })

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const requiredSpin = spinbuttons.find((s) => s.hasAttribute('required'))
    expect(requiredSpin).toBeDefined()

    const dateInput = dialog.querySelector('input[type="date"]')
    expect(dateInput).not.toBeNull()
    expect(dateInput).toBeRequired()

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить|Пополнить/ })
  })

  it('submitting the contribution form posts to /goals/{id}/contribute with amount in minor units, the selected accountId, and a date', async () => {
    mockApiForGoals([activeGoal])
    vi.mocked(api.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Пополнить' }))
    const dialog = await screen.findByRole('dialog', { name: /Отпуск/ })

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    await vi.waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(mockAccounts.length))
    await user.selectOptions(select, 'acc-2')

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const amountInput = spinbuttons.find((s) => s.hasAttribute('required')) ?? spinbuttons[0]
    await user.clear(amountInput)
    await user.type(amountInput, '20.25')

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2024-08-15' } })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить|Пополнить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/goals/goal-1/contribute')
    const b = body as Record<string, unknown>
    expect(b.amount).toBe(2025)
    expect(Number.isInteger(b.amount)).toBe(true)
    expect(b.accountId).toBe('acc-2')
    expect(b.date).toBeTruthy()
  })

  it('closes the contribution modal on a successful POST', async () => {
    mockApiForGoals([activeGoal])
    vi.mocked(api.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<GoalsPage />, { wrapper: createWrapper() })
    await screen.findByText('Отпуск')
    await user.click(screen.getByRole('button', { name: 'Пополнить' }))
    const dialog = await screen.findByRole('dialog', { name: /Отпуск/ })

    const select = within(dialog).getByRole('combobox') as HTMLSelectElement
    await vi.waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(mockAccounts.length))
    await user.selectOptions(select, 'acc-1')

    const spinbuttons = within(dialog).getAllByRole('spinbutton')
    const amountInput = spinbuttons.find((s) => s.hasAttribute('required')) ?? spinbuttons[0]
    await user.clear(amountInput)
    await user.type(amountInput, '10')

    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2024-08-15' } })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить|Пополнить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Отпуск/ })).not.toBeInTheDocument()
    })
  })
})
