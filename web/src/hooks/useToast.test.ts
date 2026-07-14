import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToast } from './useToast'

describe('useToast', () => {
  it('starts with toast === null', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toast).toBeNull()
  })

  it('showSuccess sets toast to { variant: "success", message }', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showSuccess('Готово')
    })

    expect(result.current.toast).toEqual({ variant: 'success', message: 'Готово' })
  })

  it('showError sets toast to { variant: "error", message }', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showError('Ошибка')
    })

    expect(result.current.toast).toEqual({ variant: 'error', message: 'Ошибка' })
  })

  it('dismiss sets toast back to null', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showSuccess('Готово')
    })
    expect(result.current.toast).not.toBeNull()

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.toast).toBeNull()
  })

  it('calling showSuccess after showError replaces the current toast entirely', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showError('Что-то пошло не так')
    })
    expect(result.current.toast).toEqual({ variant: 'error', message: 'Что-то пошло не так' })

    act(() => {
      result.current.showSuccess('Готово')
    })

    expect(result.current.toast).toEqual({ variant: 'success', message: 'Готово' })
  })

  it('calling showError after showSuccess replaces the current toast entirely', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showSuccess('Готово')
    })
    expect(result.current.toast).toEqual({ variant: 'success', message: 'Готово' })

    act(() => {
      result.current.showError('Ошибка')
    })

    expect(result.current.toast).toEqual({ variant: 'error', message: 'Ошибка' })
  })

  it('does not queue multiple toasts - only the latest one is retained', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showSuccess('Первое')
      result.current.showError('Второе')
      result.current.showSuccess('Третье')
    })

    expect(result.current.toast).toEqual({ variant: 'success', message: 'Третье' })
  })
})
