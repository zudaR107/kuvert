import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { accountSchema, accountUpdateSchema } from './features/accounts/router.js'
import { periodSchema, allocationSchema } from './features/periods/router.js'
import { envelopeSchema, envelopeUpdateSchema, categorySchema, categoryUpdateSchema } from './features/envelopes/router.js'
import { txSchema, txUpdateSchema, listQuerySchema, importSchema } from './features/transactions/router.js'
import { goalSchema, goalUpdateSchema, contributionSchema } from './features/goals/router.js'
import { debtSchema, debtUpdateSchema } from './features/debts/router.js'
import { updateSchema } from './features/users/router.js'
import { exportResponseSchema, platformExportResponseSchema } from './features/export/router.js'

// Purely additive/descriptive: this file only describes the API surface
// already implemented under src/features/*/router.ts, by reusing their
// real Zod schemas. It has zero effect on runtime request validation -
// deleting it wouldn't change any endpoint's behavior.

const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Ordinary Schlüssel access token with token_use=access.',
})

registry.registerComponent('securitySchemes', 'exportDelegationAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Schlüssel export delegation with token_use=export, the exact data:export scope, and hof-service:kuvert audience.',
})

const BEARER = [{ bearerAuth: [] }]
const EXPORT_AUTH: Array<Record<string, string[]>> = [
  { bearerAuth: [] },
  { exportDelegationAuth: [] },
]
const idParam = z.object({ id: z.string() })
const errorSchema = z.object({ error: z.string() })
const importResponseSchema = z.object({
  importId: z.string(),
  imported: z.number().int().nonnegative(),
  errors: z.array(z.object({
    row: z.number().int().min(2),
    error: z.string(),
  })),
})
const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  weekStart: z.enum(['monday', 'sunday']).nullable(),
  dateFormat: z.enum(['dmy', 'mdy', 'ymd']).nullable(),
  timezone: z.string().nullable(),
})

function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: { 'application/json': { schema } } }
}

function crud(basePath: string, tag: string, createSchema: z.ZodObject, updateSchema: z.ZodObject) {
  registry.registerPath({
    method: 'get', path: basePath, tags: [tag], summary: `List ${tag}`,
    security: BEARER, responses: { 200: { description: 'OK' } },
  })
  registry.registerPath({
    method: 'post', path: basePath, tags: [tag], summary: `Create a ${tag.slice(0, -1)}`,
    security: BEARER,
    description: tag === 'accounts'
      ? 'Amounts are integer minor units. A non-zero initialBalance is atomically recorded as an opening income or expense transaction on the account creation date; it cannot be changed later.'
      : undefined,
    request: { body: { content: { 'application/json': { schema: createSchema } } } },
    responses: { 201: { description: 'Created' } },
  })
  registry.registerPath({
    method: 'put', path: `${basePath}/{id}`, tags: [tag], summary: `Update a ${tag.slice(0, -1)}`,
    security: BEARER,
    description: tag === 'accounts'
      ? 'initialBalance is creation-only. Changing currency returns 409 while the account is the source or destination of any transfer.'
      : undefined,
    request: { params: idParam, body: { content: { 'application/json': { schema: updateSchema } } } },
    responses: {
      200: { description: 'OK' },
      404: { description: 'Not found' },
      ...(tag === 'accounts' ? { 409: jsonResponse('Account is linked to a transfer', errorSchema) } : {}),
    },
  })
  registry.registerPath({
    method: 'delete', path: `${basePath}/{id}`, tags: [tag], summary: `Delete/archive a ${tag.slice(0, -1)}`,
    security: BEARER, request: { params: idParam },
    responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
  })
}

// ── Accounts ─────────────────────────────────────────────────────────────
crud('/accounts', 'accounts', accountSchema, accountUpdateSchema)
registry.registerPath({
  method: 'post', path: '/accounts/{id}/restore', tags: ['accounts'], summary: 'Unarchive an account',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'get', path: '/accounts/{id}/balance', tags: ['accounts'], summary: 'Get an account\'s computed balance',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Periods ──────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/periods', tags: ['periods'], summary: 'List budget periods',
  security: BEARER, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/periods', tags: ['periods'], summary: 'Create a budget period',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: periodSchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'get', path: '/periods/{id}', tags: ['periods'], summary: 'Get a single period',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'delete', path: '/periods/{id}', tags: ['periods'], summary: 'Delete a period',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'get', path: '/periods/{id}/budget', tags: ['periods'], summary: 'Get envelope allocations/spend for a period',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'put', path: '/periods/{id}/budget/{envelopeId}', tags: ['periods'], summary: 'Set an envelope\'s allocation for a period',
  security: BEARER,
  request: { params: idParam.extend({ envelopeId: z.string() }), body: { content: { 'application/json': { schema: allocationSchema } } } },
  responses: { 200: { description: 'OK' } },
})

// ── Envelopes ────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/envelopes/categories', tags: ['envelopes'], summary: 'List envelope categories',
  security: BEARER, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/envelopes/categories', tags: ['envelopes'], summary: 'Create an envelope category',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: categorySchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'put', path: '/envelopes/categories/{id}', tags: ['envelopes'], summary: 'Update an envelope category',
  security: BEARER,
  request: { params: idParam, body: { content: { 'application/json': { schema: categoryUpdateSchema } } } },
  responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'delete', path: '/envelopes/categories/{id}', tags: ['envelopes'], summary: 'Delete an envelope category',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
crud('/envelopes', 'envelopes', envelopeSchema, envelopeUpdateSchema)
registry.registerPath({
  method: 'post', path: '/envelopes/{id}/restore', tags: ['envelopes'], summary: 'Unarchive an envelope',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Transactions ─────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/transactions', tags: ['transactions'], summary: 'List transactions',
  security: BEARER,
  description: 'Filters are applied before limit/offset pagination. Date bounds are inclusive. An accountId match includes transfers where that account is either the source or destination. Results are ordered by date, creation time, then id, all descending.',
  request: { query: listQuerySchema },
  responses: {
    200: { description: 'OK' },
    400: { description: 'Invalid filter or pagination value' },
  },
})
registry.registerPath({
  method: 'post', path: '/transactions', tags: ['transactions'], summary: 'Create a transaction',
  security: BEARER,
  description: 'Amounts are positive integer minor units. Every referenced account or envelope must belong to the caller. Transfers require a distinct destination account in the same currency and cannot have an envelope; non-transfers cannot have a destination account.',
  request: { body: { content: { 'application/json': { schema: txSchema } } } },
  responses: {
    201: { description: 'Created' },
    400: { description: 'Invalid request body or transaction/transfer combination' },
    404: jsonResponse('Referenced account or envelope not found', errorSchema),
  },
})
registry.registerPath({
  method: 'post', path: '/transactions/import', tags: ['transactions'], summary: 'Bulk-import transactions from CSV',
  security: BEARER,
  description: 'Imports one selected account from a strict comma-delimited CSV. Header names are case-insensitive and may be reordered; date, amount, and type are required, while note and envelope are optional. Dates must be real YYYY-MM-DD calendar dates, amounts must be positive decimal major-unit values, type must be income or expense, and notes are limited to 500 characters. Quoted fields support commas, newlines, and doubled quotes; malformed quote grammar rejects the entire file. Valid rows are imported even when other rows fail, and failures are returned with one-based CSV row numbers. Envelope names match existing caller-owned envelopes case-insensitively; unknown names remain unlinked. Transfers and deduplication are not supported.',
  request: { body: { content: { 'application/json': { schema: importSchema } } } },
  responses: {
    201: jsonResponse('Import completed, possibly with per-row errors', importResponseSchema),
    400: { description: 'Invalid request body, empty CSV, missing required columns, or invalid CSV quote grammar' },
    404: jsonResponse('Selected account not found', errorSchema),
    413: jsonResponse('Request body exceeds 5 MiB', errorSchema),
  },
})
registry.registerPath({
  method: 'put', path: '/transactions/{id}', tags: ['transactions'], summary: 'Update a transaction',
  security: BEARER,
  description: 'Partial updates are validated against the complete resulting transaction using the same ownership, transfer-combination, and same currency rules as creation. Changing away from transfer clears toAccountId; changing to transfer clears envelopeId.',
  request: { params: idParam, body: { content: { 'application/json': { schema: txUpdateSchema } } } },
  responses: {
    200: { description: 'OK' },
    400: { description: 'Invalid request body or transaction/transfer combination' },
    404: jsonResponse('Transaction or referenced resource not found', errorSchema),
  },
})
registry.registerPath({
  method: 'delete', path: '/transactions/{id}', tags: ['transactions'], summary: 'Delete a transaction',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Goals ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/goals', tags: ['goals'], summary: 'List active goals',
  security: BEARER, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/goals', tags: ['goals'], summary: 'Create a goal',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: goalSchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'put', path: '/goals/{id}', tags: ['goals'], summary: 'Update a goal',
  security: BEARER,
  request: { params: idParam, body: { content: { 'application/json': { schema: goalUpdateSchema } } } },
  responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'delete', path: '/goals/{id}', tags: ['goals'], summary: 'Archive a goal',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/goals/{id}/contribute', tags: ['goals'], summary: 'Record a contribution to a goal',
  security: BEARER,
  request: { params: idParam, body: { content: { 'application/json': { schema: contributionSchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'get', path: '/goals/{id}/contributions', tags: ['goals'], summary: 'List a goal\'s contributions',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Debts ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/debts', tags: ['debts'], summary: 'List debts',
  security: BEARER, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/debts', tags: ['debts'], summary: 'Create a debt',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: debtSchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'put', path: '/debts/{id}', tags: ['debts'], summary: 'Update a debt',
  security: BEARER,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: debtUpdateSchema } } },
  },
  responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'delete', path: '/debts/{id}', tags: ['debts'], summary: 'Delete a debt',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Users ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/users/me', tags: ['users'], summary: 'Get the current user\'s profile',
  security: BEARER,
  description: 'Returns Kuvert\'s service-local currency plus week-start, date-format, and timezone preferences from the verified Schlüssel token. Regional preferences are read-only here and are changed on Schlüssel\'s hosted account page.',
  responses: { 200: jsonResponse('Current profile and regional preferences', userProfileSchema) },
})
registry.registerPath({
  method: 'put', path: '/users/me', tags: ['users'], summary: 'Update currency preference',
  security: BEARER,
  description: 'Updates only Kuvert\'s three-character service-local currency. Regional preferences remain controlled by Schlüssel and are returned unchanged from the verified token.',
  request: { body: { content: { 'application/json': { schema: updateSchema } } } },
  responses: {
    200: jsonResponse('Updated profile', userProfileSchema),
    400: { description: 'Invalid currency payload' },
  },
})

// ── Export ───────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/export', tags: ['export'], summary: 'Export all data owned by the current Kuvert account',
  security: BEARER,
  description: 'Retained synchronous direct Kuvert-only JSON contract. The response is private, no-store, and nosniff; it is not the asynchronous all-services ZIP created by Schlüssel.',
  responses: {
    200: {
      description: 'Current user\'s Kuvert data and service-local currency preference',
      content: { 'application/json': { schema: exportResponseSchema } },
    },
  },
})
registry.registerPath({
  method: 'get', path: '/exports/me', tags: ['export'], summary: 'Export the subject\'s complete Kuvert data',
  security: EXPORT_AUTH,
  description: 'Synchronous direct Kuvert JSON endpoint used by the Settings download and by Schlüssel\'s asynchronous ZIP collector. Accepts either an ordinary access token or a JWKS-verified export delegation with the exact issuer, token_use=export, single hof-service:kuvert audience, data:export scope, nonempty subject/job/token IDs, and a non-expired numeric expiry. The subject is always taken from the verified token, and delegations are rejected by ordinary routes. Returns the canonical version 1 envelope with local currency, archived records, and all Kuvert relations read in one local SQLite transaction. This is not a cross-service point-in-time snapshot. Passwords/tokens/keys, runtime configuration, logs, internal operational state, other users, and other services are excluded. The response is private, no-store, and nosniff.',
  responses: {
    200: jsonResponse('Canonical Kuvert export envelope', platformExportResponseSchema),
    401: jsonResponse('Missing, invalid, expired, or incorrectly scoped token', errorSchema),
  },
})

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'Kuvert API',
    version: '0.1.0',
    description: 'Bearer tokens are obtained through Schlüssel\'s hosted Authorization Code + PKCE login flow. Kuvert has no local login form. The OpenAPI document itself is available only to authenticated administrators.',
  },
  servers: [{ url: '/' }],
})
