import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnvelopesPage } from '../features/envelopes/EnvelopesPage'

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
interface EnvelopeFixture {
  id: string
  name: string
  color: string
  rolloverEnabled: boolean
  categoryId: string | null
}

const groceriesEnvelope: EnvelopeFixture = {
  id: 'env-1',
  name: 'Продукты',
  color: '#4caf50',
  rolloverEnabled: false,
  categoryId: null,
}

const transportEnvelope: EnvelopeFixture = {
  id: 'env-2',
  name: 'Транспорт',
  color: '#2196f3',
  rolloverEnabled: true,
  categoryId: 'cat-1',
}

const essentialsCategory = {
  id: 'cat-1',
  name: 'Обязательные',
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
// Default api.get implementation: routes /envelopes and /envelopes/categories
// ---------------------------------------------------------------------------
function mockApiWithEnvelopes(
  envelopes: EnvelopeFixture[],
  categories: typeof essentialsCategory[] = [],
) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/envelopes') return Promise.resolve(envelopes)
    if (path === '/envelopes/categories') return Promise.resolve(categories)
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
// Heading, count line & create button
// ---------------------------------------------------------------------------
describe('EnvelopesPage heading and create button', () => {
  it('renders a heading containing "Конверты"', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    const heading = await screen.findByRole('heading', { name: /Конверты/ })
    expect(heading).toBeInTheDocument()
  })

  it('renders a button with accessible name "Новый конверт"', async () => {
    mockApiWithEnvelopes([])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByRole('button', { name: 'Новый конверт' })
  })

  it('shows the singular count form for a single envelope', async () => {
    mockApiWithEnvelopes([groceriesEnvelope])
    const { container } = render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    await vi.waitFor(() => {
      const text = container.textContent ?? ''
      expect(text).toContain('1 конверт')
      expect(text).not.toContain('1 конвертов')
    })
  })

  it('shows the plural count form for multiple envelopes', async () => {
    mockApiWithEnvelopes([groceriesEnvelope, transportEnvelope])
    const { container } = render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    await vi.waitFor(() => {
      const text = container.textContent ?? ''
      expect(text).toContain('2 конвертов')
    })
  })

  it('opens a "Новый конверт" modal when the header button is clicked', async () => {
    mockApiWithEnvelopes([])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })

    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))

    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })
    expect(dialog).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('EnvelopesPage loading state', () => {
  it('shows a skeleton (no cards, no empty state) while the envelopes query is pending', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}))
    render(<EnvelopesPage />, { wrapper: createWrapper() })

    expect(screen.queryByText('Продукты')).not.toBeInTheDocument()
    expect(screen.queryByText('Транспорт')).not.toBeInTheDocument()
    expect(screen.queryByText(/Конвертов пока нет/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('EnvelopesPage empty state', () => {
  it('shows an empty-state message when there are no envelopes', async () => {
    mockApiWithEnvelopes([])
    render(<EnvelopesPage />, { wrapper: createWrapper() })

    await screen.findByText(/Конвертов пока нет/)
  })

  it('empty-state action button opens the "Новый конверт" modal', async () => {
    mockApiWithEnvelopes([])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })

    await screen.findByText(/Конвертов пока нет/)

    const buttons = screen.getAllByRole('button')
    let opened = false
    for (const button of buttons) {
      await user.click(button)
      if (screen.queryByRole('dialog', { name: 'Новый конверт' })) {
        opened = true
        break
      }
    }
    expect(opened).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Populated grid
// ---------------------------------------------------------------------------
describe('EnvelopesPage with envelopes', () => {
  it('renders one card per envelope showing the envelope name', async () => {
    mockApiWithEnvelopes([groceriesEnvelope, transportEnvelope])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')
    expect(screen.getByText('Транспорт')).toBeInTheDocument()
  })

  it('shows the category name on a card when the envelope has a matching categoryId', async () => {
    mockApiWithEnvelopes([transportEnvelope], [essentialsCategory])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Транспорт')

    await vi.waitFor(() => {
      expect(screen.getByText('Обязательные')).toBeInTheDocument()
    })
  })

  it('does not show a category name when the envelope has no categoryId', async () => {
    mockApiWithEnvelopes([groceriesEnvelope], [essentialsCategory])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    expect(screen.queryByText('Обязательные')).not.toBeInTheDocument()
  })

  it('shows a rollover indicator for an envelope with rolloverEnabled true', async () => {
    mockApiWithEnvelopes([transportEnvelope])
    const { container } = render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Транспорт')

    expect(container.textContent ?? '').toMatch(/перенос/i)
  })

  it('does not show a rollover indicator for an envelope with rolloverEnabled false', async () => {
    mockApiWithEnvelopes([groceriesEnvelope])
    const { container } = render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    expect(container.textContent ?? '').not.toMatch(/перенос/i)
  })

  it('renders an "Изменить" control for each envelope', async () => {
    mockApiWithEnvelopes([groceriesEnvelope, transportEnvelope])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    const editButtons = screen.getAllByRole('button', { name: 'Изменить' })
    expect(editButtons.length).toBe(2)
  })

  it('renders an archive control with an aria-label containing "Архивировать" for each envelope', async () => {
    mockApiWithEnvelopes([groceriesEnvelope, transportEnvelope])
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    const archiveButtons = screen.getAllByRole('button', { name: /Архивировать/ })
    expect(archiveButtons.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Archive flow
// ---------------------------------------------------------------------------
describe('EnvelopesPage archive flow', () => {
  it('calls DELETE /envelopes/{id} when the archive control is activated, with no confirm step', async () => {
    mockApiWithEnvelopes([groceriesEnvelope, transportEnvelope])
    vi.mocked(api.delete).mockResolvedValue({})
    const user = userEvent.setup()

    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    const archiveButtons = screen.getAllByRole('button', { name: /Архивировать/ })
    await user.click(archiveButtons[0])

    expect(api.delete).toHaveBeenCalledWith('/envelopes/env-1')
  })
})

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------
describe('EnvelopesPage edit flow', () => {
  it('opens an "Изменить конверт" modal pre-filled with the envelope name when "Изменить" is clicked', async () => {
    mockApiWithEnvelopes([groceriesEnvelope])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))

    const dialog = await screen.findByRole('dialog', { name: 'Изменить конверт' })
    expect(within(dialog).getByDisplayValue('Продукты')).toBeInTheDocument()
  })

  it('submitting the edit form calls PUT /envelopes/{id}', async () => {
    mockApiWithEnvelopes([groceriesEnvelope])
    vi.mocked(api.put).mockResolvedValue({})
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await screen.findByText('Продукты')

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Изменить конверт' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Обновить|Изменить/ })
    await user.click(submitButton)

    expect(api.put).toHaveBeenCalledTimes(1)
    const [path] = vi.mocked(api.put).mock.calls[0]
    expect(path).toBe('/envelopes/env-1')
  })
})

// ---------------------------------------------------------------------------
// Create form fields
// ---------------------------------------------------------------------------
describe('EnvelopesPage create form fields', () => {
  it('has a "Название" text field, a "Цвет" color input, and a rollover checkbox', async () => {
    mockApiWithEnvelopes([])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    const textboxes = within(dialog).getAllByRole('textbox')
    expect(textboxes.length).toBeGreaterThanOrEqual(1)

    const colorInput = dialog.querySelector('input[type="color"]')
    expect(colorInput).toBeTruthy()

    const checkbox = within(dialog).getByRole('checkbox', { name: /перенос/i })
    expect(checkbox).toBeInTheDocument()

    within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
  })

  it('does not assert a category select when there are zero categories', async () => {
    mockApiWithEnvelopes([], [])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    // Zero categories: no assertion is made either way about the select's presence.
    expect(dialog).toBeInTheDocument()
  })

  it('renders a category select listing categories by name when categories exist', async () => {
    mockApiWithEnvelopes([], [essentialsCategory])
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    await vi.waitFor(() => {
      const select = within(dialog).getByRole('combobox') as HTMLSelectElement
      expect(select).toBeInTheDocument()
      const optionLabels = Array.from(select.options).map((o) => o.textContent)
      expect(optionLabels).toContain('Обязательные')
    })
  })
})

// ---------------------------------------------------------------------------
// Create flow submission
// ---------------------------------------------------------------------------
describe('EnvelopesPage create flow', () => {
  it('submitting the create form posts to /envelopes with the typed name and a color', async () => {
    mockApiWithEnvelopes([])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-env' })
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Развлечения')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(api.post).mock.calls[0]
    expect(path).toBe('/envelopes')
    const b = body as Record<string, unknown>
    expect(b.name).toBe('Развлечения')
    expect(typeof b.color).toBe('string')
    expect((b.color as string).length).toBeGreaterThan(0)
  })

  it('submitting with a blank name still succeeds with a non-empty fallback name', async () => {
    mockApiWithEnvelopes([])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-env' })
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    expect(api.post).toHaveBeenCalledTimes(1)
    const [, body] = vi.mocked(api.post).mock.calls[0]
    const b = body as Record<string, unknown>
    expect(typeof b.name).toBe('string')
    expect((b.name as string).length).toBeGreaterThan(0)
  })

  it('closes the modal on a successful POST', async () => {
    mockApiWithEnvelopes([])
    vi.mocked(api.post).mockResolvedValue({ id: 'new-env' })
    const user = userEvent.setup()
    render(<EnvelopesPage />, { wrapper: createWrapper() })
    await user.click(await screen.findByRole('button', { name: 'Новый конверт' }))
    const dialog = await screen.findByRole('dialog', { name: 'Новый конверт' })

    const nameInput = within(dialog).getAllByRole('textbox')[0]
    await user.type(nameInput, 'Кафе')

    const submitButton = within(dialog).getByRole('button', { name: /Сохранить|Создать|Добавить/ })
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новый конверт' })).not.toBeInTheDocument()
    })
  })
})
