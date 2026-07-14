import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Layout } from '../components/Layout'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — Layout needs Link and useLocation
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/budget' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

const mockUser: AuthUser = { id: '1', email: 'u@u.com', name: 'User', role: 'user' }

function renderLayout(logout: () => Promise<void>) {
  return render(
    <AuthContext.Provider
      value={{ user: mockUser, loading: false, logout, setUser: vi.fn() }}
    >
      <Layout>content</Layout>
    </AuthContext.Provider>,
  )
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

describe('Layout logout', () => {
  it('redirects to schlussel login after logout resolves', async () => {
    const restore = stubLocation()
    const user = userEvent.setup()
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    const { container } = renderLayout(mockLogout)
    // The Header (new, separate element) also renders a logout button now,
    // so scope this test to the sidebar's own button — same disambiguation
    // convention as sidebarResize.test.tsx: the sidebar is the first <aside>.
    const sidebar = container.querySelectorAll('aside')[0] as HTMLElement

    await user.click(within(sidebar).getByRole('button', { name: /Выйти/ }))

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

    const { container } = renderLayout(mockLogout)
    const sidebar = container.querySelectorAll('aside')[0] as HTMLElement
    await user.click(within(sidebar).getByRole('button', { name: /Выйти/ }))
    if (window.location.href) calls.push('redirect')

    expect(calls).toEqual(['logout', 'redirect'])
    restore()
  })
})
