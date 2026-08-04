import { describe, it, expect } from 'vitest'
import { validateRequiredText, validateAmount, validateDate } from '../lib/validation'

describe('validateRequiredText', () => {
  it('rejects an empty value', () => {
    expect(validateRequiredText('', 'название')).toBe('Введите название')
    expect(validateRequiredText('   ', 'название')).toBe('Введите название')
  })

  it('accepts a non-empty value', () => {
    expect(validateRequiredText('Продукты', 'название')).toBeNull()
  })
})

describe('validateAmount', () => {
  it('rejects an empty amount', () => {
    expect(validateAmount('')).toBe('Введите сумму')
  })

  it('rejects zero and negative amounts', () => {
    expect(validateAmount('0')).toBe('Сумма должна быть больше нуля')
    expect(validateAmount('-5')).toBe('Сумма должна быть больше нуля')
  })

  it('rejects a non-numeric amount', () => {
    expect(validateAmount('abc')).toBe('Сумма должна быть больше нуля')
  })

  it('accepts a positive amount with a dot', () => {
    expect(validateAmount('100.50')).toBeNull()
  })

  it('accepts a positive amount with a comma', () => {
    expect(validateAmount('100,50')).toBeNull()
  })
})

describe('validateDate', () => {
  it('rejects an empty date', () => {
    expect(validateDate('')).toBe('Выберите дату')
  })

  it('rejects a malformed date', () => {
    expect(validateDate('not-a-date')).toBe('Неверная дата')
    expect(validateDate('2026/07/01')).toBe('Неверная дата')
  })

  it('accepts a valid ISO date', () => {
    expect(validateDate('2026-07-01')).toBeNull()
  })
})
