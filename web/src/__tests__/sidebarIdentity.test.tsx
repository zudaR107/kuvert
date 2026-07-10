import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { Layout } from '../components/Layout'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — Layout needs Link and useLocation (same pattern as
// Layout.test.tsx / sidebarResize.test.tsx)
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
