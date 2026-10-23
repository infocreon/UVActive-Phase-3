# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# openssl is required by Prisma's query engine at generate/runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --include=dev
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Caps V8's heap so it self-limits well inside a 512MB container (the
# apps-s-1vcpu-0.5gb / "$5" DO plan) instead of growing until the
# platform's OOM killer hard-terminates the process — that hard kill is
# what shows up as "Container terminated due to resource limit" with no
# Node-side stack trace at all. 384MB heap + Node's own baseline +
# Prisma's native query-engine (non-heap, loaded in-process) leaves
# headroom under 512MB for the OS. If you outgrow this, the honest fix
# is more RAM (apps-s-1vcpu-1gb) — this flag avoids the *mystery* OOM,
# it doesn't create memory that isn't there.
ENV NODE_OPTIONS="--max-old-space-size=384"

RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
# `prisma` (the CLI) is a real dependency now, not a devDependency — see
# package.json. It used to be dev-only, which meant `npm ci --omit=dev`
# stripped it out of this exact stage, and both `npx prisma generate`
# below and `npx prisma migrate deploy` at container start (see CMD)
# had no local CLI to resolve. npx's fallback in that case is to fetch
# a *fresh copy from the npm registry on every single container boot* —
# slow, dependent on the container having outbound network at startup,
# and liable to resolve a different `prisma` version than the pinned
# `@prisma/client` below, which Prisma treats as a hard error. That
# startup-time fetch-and-mismatch was the most likely cause of the
# "container exited with non-zero exit code" failure. Keeping the CLI
# version pinned identically to @prisma/client and installed up front
# here removes the whole failure mode, not just papers over it.
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 8080
# Run pending migrations, THEN start. Previously ran bare
# `prisma migrate deploy` here on every container start — safe with
# one replica, but this service autoscales, and two containers booting
# together race on the SAME shared Postgres DB that branch-portal and
# admin-panel's backends also migrate against (see
# scripts/migrate-deploy-locked.cjs, added there for exactly this
# reason but never wired in here). Routed through the same advisory-
# lock wrapper so a concurrent boot waits its turn instead of racing
# into a P3009-blocked migrations table.
COPY scripts ./scripts

# Single DO App Platform / droplet instance now serves Admin, Branch,
# Trainer and Member traffic (SERVICE_SCOPE=all, see main.ts). One
# instance can't race itself on the advisory-locked migration step, but
# the wrapper stays — it's what makes a redeploy or a future second
# instance safe too, at zero extra cost today.
#
# NOTE: nest build emits to dist/src/main.js (sourceRoot: "src" in
# nest-cli.json), not dist/main.js — this previously pointed at the
# wrong path and would have failed to boot the container.
#
# HEALTHCHECK lets `docker ps` / local testing surface a stuck or
# crash-looping container quickly; App Platform's own health_check in
# infra/do-app-platform.yaml (same /api/v1/health path) is what
# actually gates traffic and restarts in production.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["sh", "-c", "node scripts/migrate-deploy-locked.cjs && node dist/src/main.js"]
