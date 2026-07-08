import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../components/Modal'

function renderModal(overrides: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <Modal open={true} onClose={onClose} title="Заголовок окна" {...overrides}>
      <p>Modal body content</p>
    </Modal>,
  )
  return { onClose, ...utils }
}

describe('Modal closed state', () => {
  it('renders nothing when open is false', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Заголовок окна">
        <p>Modal body content</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not render the title or children when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Заголовок окна">
        <p>Modal body content</p>
      </Modal>,
    )
    expect(screen.queryByText('Заголовок окна')).not.toBeInTheDocument()
    expect(screen.queryByText('Modal body content')).not.toBeInTheDocument()
  })
})

describe('Modal open state', () => {
  it('renders a dialog with correct aria attributes', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Заголовок окна')
  })

  it('renders the title text inside the dialog', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Заголовок окна')
  })

  it('renders the children inside the dialog', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modal body content')
    expect(screen.getByText('Modal body content')).toBeInTheDocument()
  })

  it('renders into document.body via a portal', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(document.body.contains(dialog)).toBe(true)
  })
})

describe('Modal close button', () => {
  it('has an accessible close button labeled "Закрыть"', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Modal backdrop interaction', () => {
  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when clicking inside the dialog content', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByText('Modal body content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose when clicking the dialog element itself (not the backdrop)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal Escape key handling', () => {
  it('calls onClose when Escape is pressed while open', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when Escape is pressed while closed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open={false} onClose={onClose} title="Заголовок окна">
        <p>Modal body content</p>
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })
})
