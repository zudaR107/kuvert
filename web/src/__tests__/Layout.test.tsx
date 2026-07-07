import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Layout } from '../components/Layout'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — Layout needs Link, useLocation, useNavigate
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/budget' }),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

const mockUser: AuthUser = { id: '1', email: 'u@u.com', name: 'User', role: 'user' }

function renderLayout(logout: () => Promise<void>) {
  return render(
    <AuthContext.Provider
      value={{ user: mockUser, loading: false, login: vi.fn(), logout }}
    >
      <Layout>content</Layout>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
})

describe('Layout logout', () => {
  it('navigates to /login after logout resolves', async () => {
    const user = userEvent.setup()
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    renderLayout(mockLogout)

    await user.click(screen.getByRole('button', { name: /Выйти/ }))

    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' })
  })

  it('calls logout before navigating (ordering)', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    const mockLogout = vi.fn().mockImplementation(async () => {
      calls.push('logout')
    })
    mockNavigate.mockImplementation(() => calls.push('navigate'))

    renderLayout(mockLogout)
    await user.click(screen.getByRole('button', { name: /Выйти/ }))

    expect(calls).toEqual(['logout', 'navigate'])
  })
})
