import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../features/auth/LoginPage'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — LoginPage only needs useNavigate
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// ---------------------------------------------------------------------------
// Helper: render LoginPage with a controllable AuthContext
// ---------------------------------------------------------------------------
interface MockAuthOptions {
  user?: AuthUser | null
  login?: (email: string, password: string) => Promise<void>
  logout?: () => Promise<void>
}

function renderLoginPage(opts: MockAuthOptions = {}) {
  const mockLogin = opts.login ?? vi.fn().mockResolvedValue(undefined)
  const mockLogout = opts.logout ?? vi.fn().mockResolvedValue(undefined)
  const mockUser = opts.user ?? null

  return {
    mockLogin,
    mockLogout,
    ...render(
      <AuthContext.Provider
        value={{ user: mockUser, loading: false, login: mockLogin, logout: mockLogout }}
      >
        <LoginPage />
      </AuthContext.Provider>,
    ),
  }
}

beforeEach(() => {
  mockNavigate.mockClear()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe('LoginPage rendering', () => {
  it('renders an email input', () => {
    renderLoginPage()
    // The <label> is not linked via htmlFor, so query by placeholder instead
    const emailInput = screen.getByPlaceholderText(/example/i)
    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')
  })

  it('email placeholder contains "example"', () => {
    renderLoginPage()
    expect(screen.getByPlaceholderText(/example/i)).toBeInTheDocument()
  })

  it('renders a password input', () => {
    renderLoginPage()
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    expect(passwordInput).toBeInTheDocument()
  })

  it('renders a submit button with text "Войти"', () => {
    renderLoginPage()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument()
  })

  it('does not show an error message initially', () => {
    renderLoginPage()
    expect(screen.queryByText('Неверный email или пароль')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Field interaction
// ---------------------------------------------------------------------------
describe('LoginPage field interaction', () => {
  it('typing in the email field updates its value', async () => {
    const user = userEvent.setup()
    renderLoginPage()
    const emailInput = screen.getByPlaceholderText(/example/i) as HTMLInputElement
    await user.type(emailInput, 'test@example.com')
    expect(emailInput.value).toBe('test@example.com')
  })

  it('typing in the password field updates its value', async () => {
    const user = userEvent.setup()
    renderLoginPage()
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(passwordInput, 'secret123')
    expect(passwordInput.value).toBe('secret123')
  })
})

// ---------------------------------------------------------------------------
// Successful login
// ---------------------------------------------------------------------------
describe('LoginPage successful login', () => {
  it('calls login with the entered email and password', async () => {
    const user = userEvent.setup()
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    renderLoginPage({ login: mockLogin })

    await user.type(screen.getByPlaceholderText(/example/i), 'admin@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'pass123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'pass123'))
  })

  it('does not show an error after successful login', async () => {
    const user = userEvent.setup()
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    renderLoginPage({ login: mockLogin })

    await user.type(screen.getByPlaceholderText(/example/i), 'admin@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'pass123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalled())
    expect(screen.queryByText('Неверный email или пароль')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Failed login
// ---------------------------------------------------------------------------
describe('LoginPage failed login', () => {
  it('shows the error message when login throws', async () => {
    const user = userEvent.setup()
    const mockLogin = vi.fn().mockRejectedValue(new Error('Login failed'))
    renderLoginPage({ login: mockLogin })

    await user.type(screen.getByPlaceholderText(/example/i), 'bad@user.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'wrong')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await screen.findByText('Неверный email или пароль')
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('LoginPage loading state', () => {
  it('shows "Подождите…" while login is in progress', async () => {
    const user = userEvent.setup()
    // login returns a promise that never resolves → perpetual loading state
    const mockLogin = vi.fn().mockImplementation(() => new Promise(() => {}))
    renderLoginPage({ login: mockLogin })

    await user.type(screen.getByPlaceholderText(/example/i), 'test@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'pass')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    // setLoading(true) is synchronous; after the click is processed the button
    // text should have changed.
    await screen.findByRole('button', { name: /Подождите/ })
  })
})

// ---------------------------------------------------------------------------
// Redirect when already authenticated
// ---------------------------------------------------------------------------
describe('LoginPage redirect', () => {
  it('calls navigate to /budget when user is already set in context', () => {
    const mockUser: AuthUser = { id: '1', email: 'u@u.com', name: 'User', role: 'user' }
    renderLoginPage({ user: mockUser })
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/budget' })
  })
})
