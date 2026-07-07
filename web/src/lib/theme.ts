export type Theme = 'light' | 'dark' | 'oled' | 'sepia'
export const THEMES: Theme[] = ['light', 'dark', 'oled', 'sepia']
const KEY = 'schloss-theme'

export function getStoredTheme(): Theme {
  const s = localStorage.getItem(KEY) as Theme | null
  if (s && THEMES.includes(s)) return s
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(KEY, t)
}
