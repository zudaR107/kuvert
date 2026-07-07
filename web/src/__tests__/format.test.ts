import { describe, it, expect } from 'vitest'
import { formatAmount, toMinorUnits, fromMinorUnits, formatDate, today } from '../lib/format'

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------
describe('formatAmount', () => {
  it('formats 0 minor units as 0 RUB', () => {
    const result = formatAmount(0)
    expect(result).toContain('0')
    expect(result).toContain('₽')
  })

  it('converts 100 minor units to 1 RUB', () => {
    const result = formatAmount(100)
    // ru-RU: "1 ₽"
    expect(result).toContain('1')
    expect(result).toContain('₽')
  })

  it('formats 1050 minor units as 10.5 RUB (uses comma in ru-RU)', () => {
    const result = formatAmount(1050)
    // ru-RU uses comma as decimal separator: "10,5 ₽"
    expect(result).toMatch(/10[,.]5/)
  })

  it('formats 10000 minor units as 100 RUB', () => {
    const result = formatAmount(10000)
    expect(result).toContain('100')
    expect(result).toContain('₽')
  })

  it('formats negative values correctly', () => {
    const result = formatAmount(-500)
    // Should contain a minus sign and "5"
    expect(result).toMatch(/-/)
    expect(result).toMatch(/5/)
  })

  it('formats large numbers with thousands separator (1 000 000 minor → 10 000 RUB)', () => {
    const result = formatAmount(1000000)
    // Result should be "10 000 ₽" where the separator may be various space types
    // Match 10<any-char>000 to handle non-breaking space or thin space
    expect(result).toMatch(/10.000/)
    expect(result).toContain('₽')
  })

  it('uses USD formatting when currency is USD', () => {
    const result = formatAmount(100, 'USD')
    expect(result).toContain('1')
    // Should NOT contain the ruble sign
    expect(result).not.toContain('₽')
  })
})

// ---------------------------------------------------------------------------
// toMinorUnits
// ---------------------------------------------------------------------------
describe('toMinorUnits', () => {
  it('converts 0 → 0', () => {
    expect(toMinorUnits(0)).toBe(0)
  })

  it('converts 1 → 100', () => {
    expect(toMinorUnits(1)).toBe(100)
  })

  it('converts 10.5 → 1050', () => {
    expect(toMinorUnits(10.5)).toBe(1050)
  })

  it('converts 10.99 → 1099', () => {
    expect(toMinorUnits(10.99)).toBe(1099)
  })

  it('rounds 0.001 → 0', () => {
    expect(toMinorUnits(0.001)).toBe(0)
  })

  it('rounds 0.005 → 1 (Math.round rounds up at .5)', () => {
    expect(toMinorUnits(0.005)).toBe(1)
  })

  it('converts 10.999 → 1100 (rounds up)', () => {
    expect(toMinorUnits(10.999)).toBe(1100)
  })
})

// ---------------------------------------------------------------------------
// fromMinorUnits
// ---------------------------------------------------------------------------
describe('fromMinorUnits', () => {
  it('converts 0 → 0', () => {
    expect(fromMinorUnits(0)).toBe(0)
  })

  it('converts 100 → 1', () => {
    expect(fromMinorUnits(100)).toBe(1)
  })

  it('converts 1050 → 10.5', () => {
    expect(fromMinorUnits(1050)).toBe(10.5)
  })

  it('converts 1099 → 10.99', () => {
    expect(fromMinorUnits(1099)).toBe(10.99)
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats 2024-01-15 with Russian locale (day, short month, year)', () => {
    const result = formatDate('2024-01-15')
    expect(result).toContain('2024')
    // ru-RU short month for January is "янв"
    expect(result).toMatch(/янв/)
    expect(result).toContain('15')
  })

  it('formats 2024-12-31 in Russian', () => {
    const result = formatDate('2024-12-31')
    expect(result).toContain('2024')
    expect(result).toContain('31')
    // ru-RU short month for December is "дек"
    expect(result).toMatch(/дек/)
  })
})

// ---------------------------------------------------------------------------
// today
// ---------------------------------------------------------------------------
describe('today', () => {
  it('returns a 10-character string', () => {
    expect(today()).toHaveLength(10)
  })

  it('matches the YYYY-MM-DD format', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches the actual current date', () => {
    const expected = new Date().toISOString().slice(0, 10)
    expect(today()).toBe(expected)
  })
})
