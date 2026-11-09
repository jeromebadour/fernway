# Fernway: one Dockerfile, two images. `--target web` is the Next.js app (public site, console, API); `--target
# worker` is the delivery worker. The database and Redis are separate containers (compose.yaml); no image holds secrets.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Only the worker's production dependencies, for the worker image.
FROM node:22-bookworm-slim AS worker-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN npm ci --omit=dev --workspace @fernway/worker --include-workspace-root=false

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
ARG APP_COMMIT=dev
ENV APP_COMMIT=$APP_COMMIT
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
ARG APP_COMMIT=dev
ENV APP_COMMIT=$APP_COMMIT
COPY --from=worker-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json ./packages/core/
COPY --from=build --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/index.js"]
