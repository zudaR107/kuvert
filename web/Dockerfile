FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY web/package.json ./web/
COPY api/package.json ./api/

# @zudar107/schloss-ui is on GitHub Packages, not npmjs.com - even
# though the package is public, installing it still requires auth.
# The token is passed as a BuildKit secret (not an ARG, so it never
# ends up baked into an image layer) and written to a user-level
# .npmrc - pnpm refuses to expand env vars in the *project* .npmrc's
# auth line (to stop a malicious committed .npmrc from exfiltrating a
# token to an attacker registry), so it can't just go in ./.npmrc.
RUN --mount=type=secret,id=npm_token \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> /root/.npmrc \
    && pnpm install --frozen-lockfile --filter web

# Vite bakes import.meta.env.VITE_* into the bundle at build time, so this
# must be declared as an ARG to actually receive the value passed via
# docker-compose's build.args.
ARG VITE_SCHLUSSEL_URL=http://localhost:4001
ENV VITE_SCHLUSSEL_URL=$VITE_SCHLUSSEL_URL
ARG VITE_SCHLOSS_URL=http://localhost:3000
ENV VITE_SCHLOSS_URL=$VITE_SCHLOSS_URL

COPY web ./web
RUN cd web && pnpm run build

FROM caddy:2-alpine AS runner
COPY --from=builder /app/web/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
