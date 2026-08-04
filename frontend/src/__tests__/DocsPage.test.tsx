import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocsPage } from '../features/docs/DocsPage'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock the api module — same convention as SettingsPage.test.tsx / AccountsPage.test.tsx.
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
// Mock swagger-ui-dist. The real package's runtime shape (checked directly
// in node_modules, not guessed) is a named `SwaggerUIBundle` export that is
// itself a callable function with a `.presets` property (`{ apis, ... }`) —
// real code calls `SwaggerUIBundle.presets.apis`, so the stub needs the same
// shape or it would throw when the component reaches that point.
// ---------------------------------------------------------------------------
const swaggerUIBundleMock = Object.assign(vi.fn(), { presets: { apis: {} } })

vi.mock('swagger-ui-dist', () => ({
  SwaggerUIBundle: swaggerUIBundleMock,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const adminUser: AuthUser = {
  id: 'u-admin',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
}

const regularUser: AuthUser = {
  id: 'u-1',
  email: 'user@example.com',
  name: 'Regular User',
  role: 'user',
}

const minimalSpec = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {},
}

// ---------------------------------------------------------------------------
// Wrapper helpers
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

function renderWithAuth(user: AuthUser | null, loading = false) {
  return render(
    <AuthContext.Provider value={{ user, loading, logout: vi.fn(), setUser: vi.fn() }}>
      <DocsPage />
    </AuthContext.Provider>,
    { wrapper: createWrapper() },
  )
}

// A generic "is there any visible text roughly matching this" helper, used
// for the loose access-denied / error content matches the spec calls for —
// deliberately not asserting on exact copy.
function hasTextMatching(pattern: RegExp): boolean {
  return screen.queryAllByText((_, element) => pattern.test(element?.textContent ?? '')).length > 0
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  swaggerUIBundleMock.mockClear()
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('DocsPage while auth is loading', () => {
  it('renders no heading and no error/denied content', () => {
    renderWithAuth(null, true)
    expect(screen.queryAllByRole('heading').length).toBe(0)
    expect(hasTextMatching(/error|ошибк|denied|доступ запрещ/i)).toBe(false)
  })

  it('does not attempt to fetch the openapi spec while loading', () => {
    renderWithAuth(null, true)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('does not attempt to mount swagger-ui-dist while loading', () => {
    renderWithAuth(null, true)
    expect(swaggerUIBundleMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Defensive: no user, not loading (shouldn't normally happen)
// ---------------------------------------------------------------------------
describe('DocsPage with no user and not loading (defensive case)', () => {
  it('does not crash', () => {
    expect(() => renderWithAuth(null, false)).not.toThrow()
  })

  it('renders no heading and no error/denied content', () => {
    renderWithAuth(null, false)
    expect(screen.queryAllByRole('heading').length).toBe(0)
    expect(hasTextMatching(/error|ошибк|denied|доступ запрещ/i)).toBe(false)
  })

  it('does not attempt to fetch the openapi spec', () => {
    renderWithAuth(null, false)
    expect(api.get).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Non-admin user
// ---------------------------------------------------------------------------
describe('DocsPage for a non-admin (role: "user") user', () => {
  it('renders an access-denied style indication', () => {
    renderWithAuth(regularUser, false)
    expect(hasTextMatching(/администратор|admin|access denied|доступ запрещ/i)).toBe(true)
  })

  it('does not call api.get to fetch the openapi spec', () => {
    renderWithAuth(regularUser, false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('does not attempt to mount swagger-ui-dist', () => {
    renderWithAuth(regularUser, false)
    expect(swaggerUIBundleMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Admin user
// ---------------------------------------------------------------------------
describe('DocsPage for an admin user', () => {
  it('fetches the openapi spec via api.get with a path referencing openapi.json', async () => {
    vi.mocked(api.get).mockResolvedValue(minimalSpec)
    renderWithAuth(adminUser, false)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    const calledPath = vi.mocked(api.get).mock.calls[0]?.[0]
    expect(String(calledPath)).toContain('openapi.json')
  })

  it('mounts SwaggerUIBundle once the spec resolves', async () => {
    vi.mocked(api.get).mockResolvedValue(minimalSpec)
    renderWithAuth(adminUser, false)

    await waitFor(() => expect(swaggerUIBundleMock).toHaveBeenCalled())
  })

  it('does not render the non-admin access-denied indication', async () => {
    vi.mocked(api.get).mockResolvedValue(minimalSpec)
    renderWithAuth(adminUser, false)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(hasTextMatching(/access denied|доступ запрещ/i)).toBe(false)
  })

  it('shows a visible error indication when the spec fetch rejects, and does not mount swagger-ui-dist', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network error'))
    renderWithAuth(adminUser, false)

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(hasTextMatching(/error|ошибк|не удалось|fail/i)).toBe(true))
    expect(swaggerUIBundleMock).not.toHaveBeenCalled()
  })
})
