import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from '../features/settings/SettingsPage'

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
const profileRub = {
  id: 'user-1',
  email: 'ivan@example.com',
  name: 'Иван Петров',
  currency: 'RUB',
}

const profileUsd = {
  id: 'user-2',
  email: 'anna@example.com',
  name: 'Анна Смирнова',
  currency: 'USD',
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

function mockApiWithProfile(profile: typeof profileRub) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/users/me') return Promise.resolve(profile)
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
// Initial fetch & loading state
// ---------------------------------------------------------------------------
describe('SettingsPage initial fetch and loading', () => {
  it('calls GET /users/me on mount', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    expect(api.get).toHaveBeenCalledWith('/users/me')
  })

  it('does not render the fetched profile data while the request is pending', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<SettingsPage />, { wrapper: createWrapper() })
    expect(screen.queryByText('Иван Петров')).not.toBeInTheDocument()
    expect(screen.queryByText('ivan@example.com')).not.toBeInTheDocument()
  })

  it('does not crash while loading and eventually shows the form', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByRole('combobox')
  })
})

// ---------------------------------------------------------------------------
// Rendering loaded profile
// ---------------------------------------------------------------------------
describe('SettingsPage once loaded', () => {
  it('renders a heading with text "Настройки"', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    expect(screen.getByText('Настройки')).toBeInTheDocument()
  })

  it('renders the fetched name and email as visible text', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
  })

  it('the currency select initial value matches the fetched profile currency when it is not the hardcoded default', async () => {
    mockApiWithProfile(profileUsd)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Анна Смирнова')

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('USD')
  })

  it('the currency select offers RUB, USD, and EUR options', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    const select = screen.getByRole('combobox') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('RUB')
    expect(values).toContain('USD')
    expect(values).toContain('EUR')
  })

  it('renders a submit button', async () => {
    mockApiWithProfile(profileRub)
    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Submitting a changed currency
// ---------------------------------------------------------------------------
describe('SettingsPage submit flow', () => {
  it('calls PUT /users/me with the newly selected currency when the form is submitted', async () => {
    mockApiWithProfile(profileRub)
    vi.mocked(api.put).mockResolvedValue({ ...profileRub, currency: 'EUR' })
    const user = userEvent.setup()

    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    const select = screen.getByRole('combobox') as HTMLSelectElement
    await user.selectOptions(select, 'EUR')
    expect(select.value).toBe('EUR')

    const submitButton = screen.getAllByRole('button')[0]
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledWith('/users/me', { currency: 'EUR' })
  })

  it('shows a success indication distinct from the idle state after a successful save', async () => {
    mockApiWithProfile(profileRub)
    vi.mocked(api.put).mockResolvedValue({ ...profileRub, currency: 'USD' })
    const user = userEvent.setup()

    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    const select = screen.getByRole('combobox') as HTMLSelectElement
    await user.selectOptions(select, 'USD')

    const submitButton = screen.getAllByRole('button')[0]
    const idleLabel = submitButton.textContent
    await user.click(submitButton)

    await vi.waitFor(() => {
      const currentButton = screen.getAllByRole('button')[0]
      expect(currentButton.textContent).not.toBe(idleLabel)
    })
  })

  it('keeps the newly-selected currency shown in the select after a successful save', async () => {
    mockApiWithProfile(profileRub)
    vi.mocked(api.put).mockResolvedValue({ ...profileRub, currency: 'EUR' })
    const user = userEvent.setup()

    render(<SettingsPage />, { wrapper: createWrapper() })
    await screen.findByText('Иван Петров')

    const select = screen.getByRole('combobox') as HTMLSelectElement
    await user.selectOptions(select, 'EUR')

    const submitButton = screen.getAllByRole('button')[0]
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(api.put).toHaveBeenCalledTimes(1)
    })

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('EUR')
  })
})
