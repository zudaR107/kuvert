import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
