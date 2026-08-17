import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  close: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(() => ({ close: lifecycle.close })),
}))
vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({ migrate: vi.fn() }))
vi.mock('../db/index.js', () => ({ db: {} }))
vi.mock('../notifications/outbox.js', () => ({
  startNotificationOutbox: vi.fn(() => ({ stop: lifecycle.stop })),
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('backend shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
    lifecycle.close.mockReset()
    lifecycle.stop.mockReset()
    vi.spyOn(process, 'once').mockImplementation(() => process)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['HTTP server', 'notification dispatcher'] as const)('waits for the %s to stop', async (pendingComponent) => {
    const serverClosed = deferred()
    const dispatcherStopped = deferred()
    lifecycle.close.mockImplementation((callback?: () => void) => {
      serverClosed.promise.then(() => callback?.())
    })
    lifecycle.stop.mockReturnValue(dispatcherStopped.promise)
    const backend = await import('../index.js')
    const shutdown = (backend as unknown as { shutdown?: () => Promise<void> }).shutdown
    expect(shutdown).toBeTypeOf('function')

    let settled = false
    const result = shutdown!().then(() => { settled = true })
    if (pendingComponent === 'HTTP server') dispatcherStopped.resolve()
    else serverClosed.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    if (pendingComponent === 'HTTP server') serverClosed.resolve()
    else dispatcherStopped.resolve()
    await expect(result).resolves.toBeUndefined()
    expect(lifecycle.close).toHaveBeenCalledOnce()
    expect(lifecycle.stop).toHaveBeenCalledOnce()
  })
})
