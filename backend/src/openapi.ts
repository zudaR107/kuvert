import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { accountSchema } from './features/accounts/router.js'
import { periodSchema, allocationSchema } from './features/periods/router.js'
import { envelopeSchema, categorySchema } from './features/envelopes/router.js'
import { txSchema, listQuerySchema, importSchema } from './features/transactions/router.js'
import { goalSchema, contributionSchema } from './features/goals/router.js'
import { debtSchema } from './features/debts/router.js'
import { updateSchema } from './features/users/router.js'

// Purely additive/descriptive: this file only describes the API surface
// already implemented under src/features/*/router.ts, by reusing their
// real Zod schemas. It has zero effect on runtime request validation -
// deleting it wouldn't change any endpoint's behavior.

const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

const BEARER = [{ bearerAuth: [] }]
const idParam = z.object({ id: z.string() })

function crud(basePath: string, tag: string, createSchema: z.ZodObject) {
  registry.registerPath({
    method: 'get', path: basePath, tags: [tag], summary: `List ${tag}`,
    security: BEARER, responses: { 200: { description: 'OK' } },
  })
  registry.registerPath({
    method: 'post', path: basePath, tags: [tag], summary: `Create a ${tag.slice(0, -1)}`,
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: createSchema } } } },
    responses: { 201: { description: 'Created' } },
  })
  registry.registerPath({
    method: 'put', path: `${basePath}/{id}`, tags: [tag], summary: `Update a ${tag.slice(0, -1)}`,
    security: BEARER,
    request: { params: idParam, body: { content: { 'application/json': { schema: createSchema.partial() } } } },
    responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
  })
  registry.registerPath({
    method: 'delete', path: `${basePath}/{id}`, tags: [tag], summary: `Delete/archive a ${tag.slice(0, -1)}`,
    security: BEARER, request: { params: idParam },
    responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
  })
}

// ── Accounts ─────────────────────────────────────────────────────────────
crud('/accounts', 'accounts', accountSchema)
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
  request: { params: idParam, body: { content: { 'application/json': { schema: categorySchema.partial() } } } },
  responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'delete', path: '/envelopes/categories/{id}', tags: ['envelopes'], summary: 'Delete an envelope category',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})
crud('/envelopes', 'envelopes', envelopeSchema)
registry.registerPath({
  method: 'post', path: '/envelopes/{id}/restore', tags: ['envelopes'], summary: 'Unarchive an envelope',
  security: BEARER, request: { params: idParam }, responses: { 200: { description: 'OK' } },
})

// ── Transactions ─────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get', path: '/transactions', tags: ['transactions'], summary: 'List transactions',
  security: BEARER, request: { query: listQuerySchema }, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'post', path: '/transactions', tags: ['transactions'], summary: 'Create a transaction',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: txSchema } } } },
  responses: { 201: { description: 'Created' } },
})
registry.registerPath({
  method: 'post', path: '/transactions/import', tags: ['transactions'], summary: 'Bulk-import transactions from CSV',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: importSchema } } } },
  responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'put', path: '/transactions/{id}', tags: ['transactions'], summary: 'Update a transaction',
  security: BEARER,
  request: { params: idParam, body: { content: { 'application/json': { schema: txSchema.partial() } } } },
  responses: { 200: { description: 'OK' } },
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
  request: { params: idParam, body: { content: { 'application/json': { schema: goalSchema.partial() } } } },
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
    body: { content: { 'application/json': { schema: debtSchema.partial().extend({ settled: z.boolean().optional() }) } } },
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
  security: BEARER, responses: { 200: { description: 'OK' } },
})
registry.registerPath({
  method: 'put', path: '/users/me', tags: ['users'], summary: 'Update currency preference',
  security: BEARER,
  request: { body: { content: { 'application/json': { schema: updateSchema } } } },
  responses: { 200: { description: 'OK' } },
})

export const openApiDocument = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: '3.0.0',
  info: { title: 'Kuvert API', version: '0.1.0' },
  servers: [{ url: '/' }],
})
