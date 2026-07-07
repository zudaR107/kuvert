FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* ./
COPY api/package.json ./api/
RUN pnpm install --frozen-lockfile --filter api
COPY api ./api
RUN cd api && pnpm exec tsc --project tsconfig.json

FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm
COPY --from=builder /app/api/package.json ./api/
COPY package.json ./
COPY pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --filter api
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/api/src/db/migrations ./api/src/db/migrations

EXPOSE 3001
CMD ["node", "api/dist/index.js"]
