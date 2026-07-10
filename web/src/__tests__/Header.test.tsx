import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — same pattern as Layout.test.tsx / sidebarResize.test.tsx.
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/budget' }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

const mockUser: AuthUser = {
  id: '1',
  email: 'jane.doe@example.com',
  name: 'Jane Doe',
  role: 'user',
}

// Header is always rendered by Layout (it is not mounted standalone anywhere
// in the app), and a standalone `<Header/>` wrapped directly in
// `AuthContext.Provider` does NOT show user-dependent content — Layout reads
// the user from context itself and passes it down, rather than Header
// reading the context directly. So these tests render the full `Layout` and
// scope assertions to the `<header>` element to exercise Header exactly as
// it's actually used, and to disambiguate it from the sidebar's own
// (pre-existing, separate) identity block / settings link / logout button,
// which live in an `<aside>`, not a `<header>`.
//
// The env var Header reads may be evaluated once at module scope rather than
// per render, so each test resets the module registry and re-imports both
// `Layout` and `AuthContext` together from that fresh registry — importing
// `AuthContext` separately from a stale, previously-cached module instance
// would give Layout/Header a context object different from the one the test
// wraps it with, silently making the provided `user` invisible.
async function renderLayout(user: AuthUser | null, logout: () => Promise<void> = vi.fn()) {
  vi.resetModules()
  const { Layout } = await import('../components/Layout')
  const { AuthContext } = await import('../hooks/useAuth')
  const { container } = render(
    <AuthContext.Provider value={{ user, loading: false, logout, setUser: vi.fn() }}>
      <Layout>content</Layout>
    </AuthContext.Provider>,
  )
  const header = container.querySelector('header') as HTMLElement
  return { header }
}

function stubLocation() {
  const original = window.location
  // @ts-expect-error -- jsdom allows reassigning location for test purposes
  delete window.location
  // @ts-expect-error -- minimal stub, only `href` is read/written by the code under test
  window.location = { ...original, href: '', pathname: '/budget' }
  return () => {
    // @ts-expect-error -- restoring jsdom's original Location object
    window.location = original
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('Header home link', () => {
  it('points "На главную" at VITE_SCHLOSS_URL when the env var is set', async () => {
    vi.stubEnv('VITE_SCHLOSS_URL', 'https://schloss.example.com')
    const { header } = await renderLayout(mockUser)

    const link = within(header).getByRole('link', { name: /главную/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://schloss.example.com')
  })

  it('falls back to http://localhost:3000 when VITE_SCHLOSS_URL is unset', async () => {
    vi.stubEnv('VITE_SCHLOSS_URL', undefined)
    const { header } = await renderLayout(mockUser)

    const link = within(header).getByRole('link', { name: /главную/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('http://localhost:3000')
  })

  it('renders the home link even when there is no user', async () => {
    const { header } = await renderLayout(null)
    expect(within(header).getByRole('link', { name: /главную/i })).toBeInTheDocument()
  })
})

describe('Header user area when a user is present', () => {
  it('shows the user name as visible text', async () => {
    const { header } = await renderLayout(mockUser)
    expect(within(header).getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders a link to /settings', async () => {
    const { header } = await renderLayout(mockUser)
    const links = within(header).getAllByRole('link') as HTMLAnchorElement[]
    const settingsLink = links.find((a) => a.getAttribute('href') === '/settings')
    expect(settingsLink).toBeTruthy()
  })

  it("renders a logout button that calls logout() and then redirects to the schlussel login page", async () => {
    const restore = stubLocation()
    const user = userEvent.setup()
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    const { header } = await renderLayout(mockUser, mockLogout)

    await user.click(within(header).getByRole('button', { name: /Выйти/ }))

    expect(mockLogout).toHaveBeenCalled()
    expect(window.location.href).toContain('/login')
    expect(window.location.href).toContain('return_to=')
    restore()
  })

  it('calls logout before redirecting (ordering)', async () => {
    const restore = stubLocation()
    const user = userEvent.setup()
    const calls: string[] = []
    const mockLogout = vi.fn().mockImplementation(async () => {
      calls.push('logout')
    })
    const { header } = await renderLayout(mockUser, mockLogout)

    await user.click(within(header).getByRole('button', { name: /Выйти/ }))
    if (window.location.href) calls.push('redirect')

    expect(calls).toEqual(['logout', 'redirect'])
    restore()
  })
})

describe('Header user area when there is no user', () => {
  it('does not render the settings link, the logout button, or any name text', async () => {
    const { header } = await renderLayout(null)

    expect(within(header).queryByRole('button', { name: /Выйти/ })).not.toBeInTheDocument()
    expect(within(header).queryByText('Jane Doe')).not.toBeInTheDocument()
    const links = within(header).getAllByRole('link') as HTMLAnchorElement[]
    const settingsLink = links.find((a) => a.getAttribute('href') === '/settings')
    expect(settingsLink).toBeFalsy()
  })
})
