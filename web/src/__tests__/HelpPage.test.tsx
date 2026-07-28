import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HelpPage } from '../features/help/HelpPage'

describe('HelpPage', () => {
  it('renders the guide heading', () => {
    render(<HelpPage />)
    expect(screen.getByText('Как пользоваться Kuvert')).toBeInTheDocument()
  })

  it('renders a heading for every main tab', () => {
    render(<HelpPage />)
    expect(screen.getByText('Счета')).toBeInTheDocument()
    expect(screen.getByText('Бюджет')).toBeInTheDocument()
    expect(screen.getByText('Транзакции')).toBeInTheDocument()
    expect(screen.getByText('Цели')).toBeInTheDocument()
    expect(screen.getByText('Долги')).toBeInTheDocument()
    expect(screen.getByText('Настройки')).toBeInTheDocument()
  })
})
