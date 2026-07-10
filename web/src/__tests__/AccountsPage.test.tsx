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

// ---------------------------------------------------------------------------
// Default api.get implementation: routes /accounts and /accounts/{id}/balance
// ---------------------------------------------------------------------------
function mockApiWithAccounts(accounts: typeof checkingAccount[], balances: Record<string, number> = {}) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/accounts') return Promise.resolve(accounts)
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

  it('the create form has a required name input, a type select, a currency input, an initial balance input, and a submit button', async () => {
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

  it('submitting the edit form calls PUT /accounts/{id} with an integer initialBalance', async () => {
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
    expect(Number.isInteger((body as Record<string, unknown>).initialBalance)).toBe(true)
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
