# VEYRA 3D API + generation worker (same image, different command).
# Monorepo-aware multi-stage build.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable && apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false
# Generate Prisma client, then build the api (turbo builds package deps first).
RUN pnpm --filter @veyra/database generate \
    && pnpm --filter @veyra/api... build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo
EXPOSE 4000
# Override command in compose: main.js (API) or worker.js (generation worker).
CMD ["node", "apps/api/dist/main.js"]
