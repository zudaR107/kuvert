import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Layout } from '../components/Layout'
import { AuthContext } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'

// ---------------------------------------------------------------------------
// Mock TanStack Router — Layout needs Link and useLocation (same pattern as
// Layout.test.tsx)
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/budget' }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

const mockUser: AuthUser = { id: '1', email: 'u@u.com', name: 'User', role: 'user' }

const STORAGE_KEY = 'kuvert-sidebar-width'

function renderLayout() {
  const { container } = render(
    <AuthContext.Provider value={{ user: mockUser, loading: false, logout: vi.fn(), setUser: vi.fn() }}>
      <Layout>content</Layout>
    </AuthContext.Provider>,
  )
  // The sidebar is the first <aside> (desktop rail); a second, mobile
  // off-canvas <aside> also exists in the tree.
  const sidebar = container.querySelectorAll('aside')[0] as HTMLElement
  // The resize handle is the element spanning the sidebar's full right edge.
  const handle = sidebar.querySelector('[style*="cursor: col-resize"]') as HTMLElement
  // The small round collapse/expand toggle button.
  const toggleBtn = sidebar.querySelector('button[style*="border-radius: 50%"]') as HTMLElement
  return { sidebar, handle, toggleBtn }
}

function widthPx(el: HTMLElement): number {
  return parseInt(el.style.width, 10)
}

function drag(handle: HTMLElement, fromX: number, toXs: number[]) {
  fireEvent.mouseDown(handle, { clientX: fromX })
  for (const x of toXs) {
    fireEvent.mouseMove(window, { clientX: x })
  }
}

beforeEach(() => {
  localStorage.clear()
  cleanup()
})

describe('sidebar resize handle', () => {
  it('renders with a default width of roughly 220px', () => {
    const { sidebar, handle } = renderLayout()
    expect(widthPx(sidebar)).toBeGreaterThanOrEqual(200)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(240)
    // Handle must exist and cover the full vertical edge, not just a small button.
    expect(handle).toBeTruthy()
    expect(handle.style.top).toBe('0px')
    expect(handle.style.bottom).toBe('0px')
  })

  it('changes the sidebar width in real time while dragging', () => {
    const { sidebar, handle } = renderLayout()
    const startWidth = widthPx(sidebar)
    fireEvent.mouseDown(handle, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 40 })
    // Width should already reflect the drag before mouseup.
    expect(widthPx(sidebar)).toBeGreaterThan(startWidth)
    fireEvent.mouseMove(window, { clientX: 80 })
    expect(widthPx(sidebar)).toBeGreaterThan(startWidth + 20)
    fireEvent.mouseUp(window)
  })

  it('clamps the expanded width to a maximum of roughly 360px', () => {
    const { sidebar, handle } = renderLayout()
    drag(handle, 0, [500, 1000])
    fireEvent.mouseUp(window)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(380)
    expect(widthPx(sidebar)).toBeGreaterThanOrEqual(340)
  })

  it('clamps the expanded width to a minimum of roughly 180px when dragged narrower than the collapse threshold but not past it', () => {
    const { sidebar, handle } = renderLayout()
    // Drag to a target width of ~150px — inside the "snap to collapse" zone
    // boundary but above it; per spec this should rest at the ~180 minimum,
    // not stop at 150.
    drag(handle, 0, [150 - 220])
    fireEvent.mouseUp(window)
    expect(widthPx(sidebar)).toBeGreaterThanOrEqual(170)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(190)
  })

  it('snaps to the fully collapsed icon-only rail (~64px) when dragged narrower than the threshold', () => {
    const { sidebar, handle } = renderLayout()
    // Drag to a target width of ~90px — well below the ~140 threshold.
    drag(handle, 0, [90 - 220])
    fireEvent.mouseUp(window)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(80)
    expect(widthPx(sidebar)).toBeGreaterThanOrEqual(50)
  })

  it('has no resting width between the collapse threshold and the expanded minimum', () => {
    const { sidebar, handle } = renderLayout()
    drag(handle, 0, [90 - 220])
    fireEvent.mouseUp(window)
    const w = widthPx(sidebar)
    const isCollapsed = w <= 80
    const isExpandedMin = w >= 170 && w <= 190
    expect(isCollapsed || isExpandedMin).toBe(true)
    expect(w > 90 && w < 170).toBe(false)
  })

  it('stops resizing once the mouse is released, ignoring further mousemove events (no leaked listener)', () => {
    const { sidebar, handle } = renderLayout()
    drag(handle, 0, [80])
    const widthAtMouseUp = widthPx(sidebar)
    fireEvent.mouseUp(window)
    fireEvent.mouseMove(window, { clientX: 300 })
    fireEvent.mouseMove(window, { clientX: 500 })
    expect(widthPx(sidebar)).toBe(widthAtMouseUp)
  })

  it('persists the last dragged expanded width to localStorage', () => {
    const { sidebar, handle } = renderLayout()
    drag(handle, 0, [60]) // target ~280px, within expanded range
    fireEvent.mouseUp(window)
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const storedWidth = Number(stored)
    expect(storedWidth).toBe(widthPx(sidebar))
    expect(storedWidth).toBeGreaterThanOrEqual(180)
    expect(storedWidth).toBeLessThanOrEqual(360)
  })

  it('does NOT persist the collapsed width (64px) to localStorage when dragged into collapse', () => {
    const { handle } = renderLayout()
    // First establish a known expanded width in storage.
    drag(handle, 0, [60]) // -> ~280px
    fireEvent.mouseUp(window)
    const expandedStored = Number(localStorage.getItem(STORAGE_KEY))
    expect(expandedStored).toBeGreaterThanOrEqual(180)

    // Now drag into the collapsed zone.
    drag(handle, 0, [90 - 220])
    fireEvent.mouseUp(window)

    const storedAfterCollapse = localStorage.getItem(STORAGE_KEY)
    expect(storedAfterCollapse).not.toBeNull()
    const val = Number(storedAfterCollapse)
    // Should never store the collapsed rail width, and must remain a valid
    // expanded width (>=180).
    expect(val).not.toBe(64)
    expect(val).toBeGreaterThanOrEqual(180)
    expect(val).toBeLessThanOrEqual(360)
  })

  it('remembers the persisted width across a remount', () => {
    const { handle } = renderLayout()
    drag(handle, 0, [110]) // target ~330px
    fireEvent.mouseUp(window)
    const storedWidth = Number(localStorage.getItem(STORAGE_KEY))
    cleanup()

    const { sidebar: sidebar2 } = renderLayout()
    expect(widthPx(sidebar2)).toBe(storedWidth)
  })

  it('does not crash and renders an in-range width when localStorage has a corrupted/out-of-range value', () => {
    localStorage.setItem(STORAGE_KEY, '999999')
    expect(() => renderLayout()).not.toThrow()
    const { sidebar: s1 } = renderLayout()
    expect(widthPx(s1)).toBeGreaterThanOrEqual(180)
    expect(widthPx(s1)).toBeLessThanOrEqual(360)
    cleanup()

    localStorage.setItem(STORAGE_KEY, 'not-a-number')
    expect(() => renderLayout()).not.toThrow()
    const { sidebar: s2 } = renderLayout()
    expect(widthPx(s2)).toBeGreaterThanOrEqual(180)
    expect(widthPx(s2)).toBeLessThanOrEqual(360)
    cleanup()

    localStorage.setItem(STORAGE_KEY, '1')
    expect(() => renderLayout()).not.toThrow()
    const { sidebar: s3 } = renderLayout()
    expect(widthPx(s3)).toBeGreaterThanOrEqual(180)
    expect(widthPx(s3)).toBeLessThanOrEqual(360)
  })
})

describe('sidebar collapse/expand toggle button', () => {
  it('remains clickable and toggles between collapsed and expanded state', () => {
    const { sidebar, toggleBtn } = renderLayout()
    expect(toggleBtn).toBeTruthy()
    const initialWidth = widthPx(sidebar)
    expect(initialWidth).toBeGreaterThan(80) // starts expanded

    fireEvent.click(toggleBtn)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(80) // now collapsed

    fireEvent.click(toggleBtn)
    expect(widthPx(sidebar)).toBeGreaterThan(80) // expanded again
  })

  it('toggle click expands back to the last-remembered width, not always the default', () => {
    localStorage.setItem(STORAGE_KEY, '300')
    const { sidebar, toggleBtn } = renderLayout()
    expect(widthPx(sidebar)).toBe(300)

    fireEvent.click(toggleBtn) // collapse
    expect(widthPx(sidebar)).toBeLessThanOrEqual(80)

    fireEvent.click(toggleBtn) // expand
    expect(widthPx(sidebar)).toBe(300)
  })

  it('remains clickable and functions correctly even right after a drag-resize interaction (drag handle must not swallow its clicks)', () => {
    const { sidebar, handle, toggleBtn } = renderLayout()
    drag(handle, 0, [40]) // resize a bit
    fireEvent.mouseUp(window)
    const widthAfterDrag = widthPx(sidebar)
    expect(widthAfterDrag).toBeGreaterThan(80)

    fireEvent.click(toggleBtn)
    expect(widthPx(sidebar)).toBeLessThanOrEqual(80)
  })

  it('does not itself write to localStorage while collapsed via toggle (collapsed state is not persisted)', () => {
    const { toggleBtn } = renderLayout()
    // Establish an expanded baseline via drag so we have a known stored value.
    localStorage.setItem(STORAGE_KEY, '250')
    fireEvent.click(toggleBtn) // collapse
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(Number(stored)).toBe(250)
    expect(Number(stored)).not.toBe(64)
  })
})
