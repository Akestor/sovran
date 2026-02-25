FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# -- deps: install with all workspace package.json for lockfile resolution --
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/gateway/package.json apps/gateway/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/proto/package.json packages/proto/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile

# -- build: add source, compile, fix main fields for prod --
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm -r build
RUN for pkg in packages/shared packages/proto packages/db packages/domain; do \
      sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|g' "$pkg/package.json" && \
      sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|g' "$pkg/package.json"; \
    done

# -- runtime: node:20-slim required for uWebSockets.js (needs glibc) --
FROM node:20-slim AS runtime
RUN groupadd -g 1001 sovran && useradd -u 1001 -g sovran -s /bin/sh sovran
WORKDIR /app
COPY --from=build /app .
USER sovran
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health',r=>{r.statusCode===200?process.exit(0):process.exit(1)}).on('error',()=>process.exit(1))"

CMD ["node", "apps/gateway/dist/index.js"]
