import { describe, it, expect, beforeEach, vi } from 'vitest'
import { THEMES, applyTheme, getStoredTheme } from '../lib/theme'

const STORAGE_KEY = 'schloss-theme'

// Helper to set up matchMedia mock with a configurable `matches` result.
function mockMatchMedia(darkMode: boolean) {
  window.matchMedia = (query: string) => ({
    matches: darkMode && query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(false)
  // Reset data-theme attribute
  document.documentElement.removeAttribute('data-theme')
})

// ---------------------------------------------------------------------------
// THEMES constant
// ---------------------------------------------------------------------------
describe('THEMES', () => {
  it('contains exactly 4 themes', () => {
    expect(THEMES).toHaveLength(4)
  })

  it('contains themes in the correct order: light, dark, oled, sepia', () => {
    expect(THEMES).toEqual(['light', 'dark', 'oled', 'sepia'])
  })
})

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------
describe('applyTheme', () => {
  it('sets data-theme attribute on documentElement', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('sets data-theme to the given theme value', () => {
    applyTheme('oled')
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled')
  })

  it('saves the theme to localStorage under "schloss-theme"', () => {
    applyTheme('sepia')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sepia')
  })

  it('updates localStorage when called again with a different theme', () => {
    applyTheme('light')
    applyTheme('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

// ---------------------------------------------------------------------------
// getStoredTheme
// ---------------------------------------------------------------------------
describe('getStoredTheme', () => {
  it('returns the stored theme when it is valid', () => {
    localStorage.setItem(STORAGE_KEY, 'oled')
    expect(getStoredTheme()).toBe('oled')
  })

  it('returns "sepia" when "sepia" is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia')
    expect(getStoredTheme()).toBe('sepia')
  })

  it('falls back to "light" when no value is stored and system is light', () => {
    mockMatchMedia(false)
    expect(getStoredTheme()).toBe('light')
  })

  it('falls back to "dark" when no value is stored and system prefers dark', () => {
    mockMatchMedia(true)
    expect(getStoredTheme()).toBe('dark')
  })

  it('ignores an invalid stored value and falls back to system preference (light)', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-theme')
    mockMatchMedia(false)
    expect(getStoredTheme()).toBe('light')
  })

  it('ignores an invalid stored value and falls back to system preference (dark)', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-theme')
    mockMatchMedia(true)
    expect(getStoredTheme()).toBe('dark')
  })
})
