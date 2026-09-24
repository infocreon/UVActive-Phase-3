# UV Active — Branch Portal

Module 3/5 of the [UV Active platform](../README.md) — the day-to-day
console for one gym: roster, trainers, sessions, transfer requests,
sensor inventory. A thin client wired live to `uvactive-unified-backend`;
no mock data — every screen calls a real endpoint.

## Stack

- React 18 + TypeScript + Vite (SWC)
- Tailwind CSS + shadcn/ui (Radix primitives) — design tokens shared with
  every other UV Active surface, web and native (identical palette to the
  Admin Panel)
- TanStack Query for all server state
- Plain `fetch` client (`src/lib/api.ts`) — envelope unwrapping + token
  refresh built in, no axios dependency
- Google Identity Services for optional "Sign in with Google" staff login

## Getting started

```bash
npm install
cp .env.example .env   # points VITE_API_BASE_URL at the backend
npm run dev            # → http://localhost:5173
```

You need `uvactive-unified-backend` running separately (default
`http://localhost:8080`, global prefix `/api/v1`) — see
[its README](../uvactive-unified-backend/README.md). CORS on the backend
must allow this app's origin (`CORS_ORIGINS` in the backend's `.env`).

Staff (`branch_manager` / `trainer`) accounts are created via the Admin
Panel — Admin Panel and Branch Portal share the same underlying `Staff`
table through the same backend, just scoped by which JWT realm the login
issues.

## Repo map

```
src/
  main.tsx / App.tsx        Entry point, router, providers
  index.css                 UV Active design tokens (HSL custom properties) —
                             identical values to the Admin Panel's index.css
  lib/                       api.ts (fetch client), auth-context.tsx (login/2FA/
                             logout), Google Identity glue, types.ts
  hooks/branch/               branch-scoped data hooks (TanStack Query) — roster,
                             trainers, sessions, transfer-requests, sensors
  components/branch/          branch-scoped UI: roster table, session builder,
                             sensor list, transfer-request cards, etc.
  components/ui/              shadcn/ui primitives (Radix-based) — shared kit
  pages/branch/                routed pages
```

## What's wired up

- **Roster** — member search, add-by-code, profile detail, PIN reset,
  release from gym
- **Trainers** — branch-scoped trainer list, invite/suspend
- **Sessions** — create/schedule, live session monitor, per-member results
- **Transfer requests** — accept/decline members transferring in from
  another branch, with automatic expiry handled server-side
- **Sensors** — BLE sensor inventory registration and status

## Deploying

Static site — build output is a plain `dist/` folder.

```bash
npm ci
npm run build      # → dist/
```

- **Vercel**: import the repo, framework preset "Vite" — `vercel.json`
  already has the SPA rewrite. Set `VITE_API_BASE_URL` (and, if used,
  `VITE_GOOGLE_STAFF_CLIENT_ID`) as project env vars.
- **Render**: `render.yaml` in this folder deploys it as a static site
  (`Render dashboard → New → Blueprint`). Same env vars, set there.
- **Netlify / any static host**: same build command, same SPA rewrite
  rule (`/* → /index.html`).

Point `VITE_API_BASE_URL` at wherever `uvactive-unified-backend` is
deployed, including the `/api/v1` prefix — this app never talks to
anything else.

**One lockfile only**: this repo ships a single `package-lock.json` (npm).
Don't add a `yarn.lock`, `pnpm-lock.yaml`, or `bun.lock` alongside it —
most platforms auto-detect the package manager from whichever lockfile is
present, and two different lockfiles in the same folder make that
ambiguous, which is a common cause of a build failing before your build
command even runs.
