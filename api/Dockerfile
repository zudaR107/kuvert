FROM node:22-alpine AS builder
WORKDIR /app
# Pinned exactly, matching CI - an unpinned "pnpm" install pulls
# whatever's newest at build time, which broke the build outright once
# (a self-installer bug in 11.12.0), unrelated to any change in this repo.
RUN npm install -g pnpm@11.7.0

# pnpm runs a deps-status check before any "run"/"exec" script (e.g.
# "pnpm exec tsc" below) and, on a mismatch, tries to reinstall - which
# needs interactive confirmation to purge node_modules, and a Docker
# build has no TTY to give it. GitHub Actions sets CI=true for every
# workflow automatically (which is why this never showed up there), so
# it must be set explicitly here.
ENV CI=true

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY api/package.json ./api/
COPY web/package.json ./web/

# better-sqlite3's install script downloads a prebuilt binary and only
# falls back to compiling from source (needs Python + a C/C++
# toolchain, absent from node:22-alpine by default) if that download
# fails - a transient network hiccup then hard-fails the whole build
# instead of just being slower. Installed unconditionally so the rare
# fallback path works instead of erroring out.
RUN apk add --no-cache python3 make g++

# pnpm's frozen-lockfile install fetches every package in the lockfile
# to verify it, not just the current project's own deps, even with
# --filter - since web's @zudar107/schloss-ui is part of the same
# workspace lockfile, this image needs GitHub Packages auth too,
# despite the API never using that package. The token is passed as a
# BuildKit secret (not an ARG, so it never ends up baked into an image
# layer) and written to a user-level .npmrc - pnpm refuses to expand
# env vars in the *project* .npmrc's auth line (to stop a malicious
# committed .npmrc from exfiltrating a token to an attacker registry),
# so it can't just go in ./.npmrc.
RUN --mount=type=secret,id=npm_token \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> /root/.npmrc \
    && pnpm install --frozen-lockfile --filter api
COPY api ./api
RUN cd api && pnpm exec tsc --project tsconfig.json

FROM node:22-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@11.7.0
COPY --from=builder /app/api/package.json ./api/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json ./web/
# See the builder stage's comment above - same fallback-compile issue.
RUN apk add --no-cache python3 make g++
RUN --mount=type=secret,id=npm_token \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> /root/.npmrc \
    && pnpm install --prod --frozen-lockfile --filter api
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/api/src/db/migrations ./api/dist/db/migrations

EXPOSE 3001
CMD ["node", "api/dist/index.js"]
