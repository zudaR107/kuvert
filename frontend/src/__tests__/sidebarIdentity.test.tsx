import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Layout } from '../components/Layout'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — Layout needs Link and useLocation (same pattern as
// Layout.test.tsx / sidebarResize.test.tsx)
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/budget' }),
  useNavigate: () => vi.fn(),
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

function renderWithUser(user: AuthUser | null, loading = false) {
  return render(
    <AuthContext.Provider value={{ user, loading, logout: vi.fn(), setUser: vi.fn() }}>
      <Layout>content</Layout>
    </AuthContext.Provider>,
  )
}

describe('sidebar user identity block', () => {
  it('shows the user name and email when a user is present', () => {
    const { container } = renderWithUser(mockUser)
    // The Header (new, separate element) also shows the user's name now,
    // so scope the name assertion to the sidebar's own identity block —
    // same disambiguation convention as sidebarResize.test.tsx: the
    // sidebar is the first <aside> (the mobile off-canvas one is second).
    const sidebar = container.querySelectorAll('aside')[0] as HTMLElement
    expect(within(sidebar).getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument()
  })

  it('does not render identity text and does not crash when there is no user (logged out)', () => {
    expect(() => renderWithUser(null, false)).not.toThrow()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    expect(screen.queryByText('jane.doe@example.com')).not.toBeInTheDocument()
  })

  it('does not render identity text and does not crash while auth is still loading (no user yet)', () => {
    cleanup()
    expect(() => renderWithUser(null, true)).not.toThrow()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
    expect(screen.queryByText('jane.doe@example.com')).not.toBeInTheDocument()
  })
})

describe('Footer', () => {
  it('renders footer text and a link to the GitHub repo in the default layout state', () => {
    renderWithUser(mockUser)
    const footer = document.querySelector('footer')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveTextContent('Kuvert — открытый код, свой хостинг')

    const link = screen.getByRole('link', { name: /github/i }) as HTMLAnchorElement
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('https://github.com/zudaR107')
  })

  it('renders the footer even when there is no user', () => {
    renderWithUser(null)
    const footer = document.querySelector('footer')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveTextContent('Kuvert — открытый код, свой хостинг')
  })
})

// ---------------------------------------------------------------------------
// The identity block is now a click target that sends the browser to
// schlussel's unified account settings page (same destination as the
// Header avatar tested in Header.test.tsx — see buildSchluesselAccountUrl in
// lib/authRedirect.ts). Convention for stubbing window.location.href follows
// the stubLocation() helper in Header.test.tsx / authRedirect.test.ts. No
// VITE_SCHLUSSEL_URL is stubbed here, so the code under test falls back to
// its documented default of http://localhost:4001.
// ---------------------------------------------------------------------------
describe('sidebar identity block click (schlussel account link)', () => {
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

  // Finds the row wrapping both the name and email text — clicking directly
  // on this shared ancestor (rather than on the name/email text nodes
  // themselves) proves the whole row is the click target, not just one
  // sub-element inside it.
  function identityRow(sidebar: HTMLElement): HTMLElement {
    const nameEl = within(sidebar).getByText(mockUser.name)
    const emailEl = within(sidebar).getByText(mockUser.email)
    const ancestors = new Set<HTMLElement>()
    let el: HTMLElement | null = nameEl
    while (el) {
      ancestors.add(el)
      el = el.parentElement
    }
    el = emailEl
    while (el && !ancestors.has(el)) {
      el = el.parentElement
    }
    if (!el) throw new Error('no common ancestor found for name/email in the sidebar identity block')
    return el
  }

  it('sets window.location.href to a schlussel /account URL with a return_to param when the identity row is clicked', async () => {
    const restore = stubLocation()
    const user = userEvent.setup()
    const { container } = renderWithUser(mockUser)
    const sidebar = container.querySelectorAll('aside')[0] as HTMLElement
    const row = identityRow(sidebar)

    await user.click(row)

    expect(window.location.href.startsWith('http://localhost:4001')).toBe(true)
    expect(window.location.href).toContain('/account')
    expect(window.location.href).toContain('return_to=')
    restore()
  })

  it('does not toggle the sidebar collapsed/expanded state when the identity row is clicked', async () => {
    const restore = stubLocation()
    const user = userEvent.setup()
    const { container } = renderWithUser(mockUser)
    const sidebar = container.querySelectorAll('aside')[0] as HTMLElement
    const row = identityRow(sidebar)
    const initialWidth = sidebar.style.width

    await user.click(row)

    expect(sidebar.style.width).toBe(initialWidth)
    restore()
  })
})
