import { createNotificationOutboxRuntime, type NotificationOutboxRow } from '@zudar107/schloss-server-kit'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index.js'
import { notificationOutbox } from '../db/schema.js'

const SOURCE = 'kuvert'
const DEFAULT_GLOCKE_BASE_URL = 'http://glocke-backend:3004'
const MAX_OUTBOX_RETENTION_MS = 2_147_483_647
const DEFAULT_OUTBOX_RETENTION_MS = MAX_OUTBOX_RETENTION_MS
const MAX_OUTBOX_CLEANUP_INTERVAL_MS = 60 * 60_000

function eligibleAt(nowMs: number) {
  // Picks up both never-attempted rows (nextAttemptAt null/due) and rows
  // whose lease expired without a mark* call ever landing (a crash mid-
  // delivery) - either way, eligible for a fresh claim.
  return or(
    and(
      eq(notificationOutbox.state, 'pending'),
      or(isNull(notificationOutbox.nextAttemptAt), lte(notificationOutbox.nextAttemptAt, nowMs)),
    ),
    and(
      eq(notificationOutbox.state, 'inflight'),
      or(isNull(notificationOutbox.leaseUntil), lte(notificationOutbox.leaseUntil, nowMs)),
    ),
  )
}

function removeExpiredTerminalRows(retentionMs: number): void {
  const cutoff = Date.now() - retentionMs
  db.delete(notificationOutbox).where(or(
    and(eq(notificationOutbox.state, 'delivered'), lte(notificationOutbox.deliveredAt, cutoff)),
    and(eq(notificationOutbox.state, 'permanent'), lte(notificationOutbox.permanentAt, cutoff)),
  )).run()
}

function startTerminalOutboxCleanup(retentionMs: number) {
  removeExpiredTerminalRows(retentionMs)
  const timer = setInterval(
    () => removeExpiredTerminalRows(retentionMs),
    Math.min(retentionMs, MAX_OUTBOX_CLEANUP_INTERVAL_MS),
  )
  timer.unref()

  return {
    async stop(): Promise<void> {
      clearInterval(timer)
    },
  }
}

// Wires kuvert's own notification_outbox table into the shared
// storage-agnostic delivery runtime (@zudar107/schloss-server-kit's
// createNotificationOutboxRuntime) - this file owns the SQLite
// transaction/lease-fencing/dedupe policy the shared runtime deliberately
// stays agnostic to. Returns a no-op stoppable stub (rather than
// throwing) when the HMAC credentials aren't configured, so a dev/test
// environment without Glocke set up doesn't crash on boot - events still
// get recorded (see features/goals/router.ts), they just queue up
// undelivered until credentials are added.
export function startNotificationOutbox() {
  const keyId = process.env['KUVERT_TO_GLOCKE_HMAC_KEY_ID']
  const secret = process.env['KUVERT_TO_GLOCKE_HMAC_SECRET']
  const retentionMs = Number(process.env['GLOCKE_OUTBOX_RETENTION_MS'] ?? DEFAULT_OUTBOX_RETENTION_MS)
  if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0 || retentionMs > MAX_OUTBOX_RETENTION_MS) {
    throw new Error(`GLOCKE_OUTBOX_RETENTION_MS must be an integer between 1 and ${MAX_OUTBOX_RETENTION_MS}`)
  }

  if (!keyId && !secret) {
    const cleanup = startTerminalOutboxCleanup(retentionMs)
    console.warn('[Kuvert] KUVERT_TO_GLOCKE_HMAC_KEY_ID/SECRET not configured - notification delivery disabled, events will queue undelivered')
    return cleanup
  }
  if (!keyId || !secret) {
    throw new Error('KUVERT_TO_GLOCKE_HMAC_KEY_ID and KUVERT_TO_GLOCKE_HMAC_SECRET must be configured together')
  }

  const runtime = createNotificationOutboxRuntime({
    source: SOURCE,
    keyId,
    secret,
    baseUrl: process.env['GLOCKE_BASE_URL'] ?? DEFAULT_GLOCKE_BASE_URL,
    leaseDurationMs: Number(process.env['GLOCKE_OUTBOX_LEASE_MS'] ?? 30_000),
    requestTimeoutMs: Number(process.env['GLOCKE_FETCH_TIMEOUT_MS'] ?? 10_000),
    pollIntervalMs: Number(process.env['GLOCKE_DISPATCH_INTERVAL_MS'] ?? 1_000),
    stopTimeoutMs: Number(process.env['GLOCKE_WORKER_STOP_TIMEOUT_MS'] ?? 5_000),
    maxAttempts: Number(process.env['GLOCKE_MAX_ATTEMPTS'] ?? 8),
    baseDelayMs: Number(process.env['GLOCKE_RETRY_BASE_DELAY_MS'] ?? 1_000),
    maxDelayMs: Number(process.env['GLOCKE_RETRY_MAX_DELAY_MS'] ?? 15 * 60_000),

    async claim({ now, leaseUntil }) {
      const nowMs = now.getTime()
      const leaseId = randomUUID()
      return db.transaction((tx) => {
        const row = tx.select().from(notificationOutbox)
          .where(eligibleAt(nowMs))
          .orderBy(asc(notificationOutbox.createdAt), asc(notificationOutbox.id))
          .limit(1)
          .get()
        if (!row) return null

        tx.update(notificationOutbox)
          .set({ state: 'inflight', leaseId, leaseUntil: leaseUntil.getTime() })
          .where(eq(notificationOutbox.id, row.id))
          .run()

        return {
          id: row.id,
          type: row.eventType,
          occurredAt: new Date(row.createdAt).toISOString(),
          correlationId: row.correlationId,
          payload: JSON.parse(row.payload) as unknown,
          attempts: row.attempts,
          leaseToken: leaseId,
        } satisfies NotificationOutboxRow
      })
    },

    async markDelivered({ id, leaseToken, deliveredAt }) {
      const result = db.update(notificationOutbox).set({
        state: 'delivered', leaseId: null, leaseUntil: null,
        deliveredAt: deliveredAt.getTime(), lastError: null,
      }).where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.leaseId, leaseToken))).run()
      return result.changes > 0
    },

    async markRetry({ id, leaseToken, attempts, nextAttemptAt, error }) {
      const result = db.update(notificationOutbox).set({
        state: 'pending', attempts, nextAttemptAt: nextAttemptAt.getTime(),
        leaseId: null, leaseUntil: null, lastError: error,
      }).where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.leaseId, leaseToken))).run()
      return result.changes > 0
    },

    async markPermanent({ id, leaseToken, attempts, error }) {
      const result = db.update(notificationOutbox).set({
        state: 'permanent', attempts, nextAttemptAt: null,
        leaseId: null, leaseUntil: null, permanentAt: Date.now(), lastError: error,
      }).where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.leaseId, leaseToken))).run()
      return result.changes > 0
    },
  })

  const cleanup = startTerminalOutboxCleanup(retentionMs)
  runtime.start()
  return {
    ...runtime,
    async stop(): Promise<void> {
      await Promise.all([runtime.stop(), cleanup.stop()])
    },
  }
}
