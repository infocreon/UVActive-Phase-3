# UV Active — Admin Panel

Module 2/5 of the [UV Active platform](../README.md) — the platform-wide
control room: every gym, trainer, member, and session, across every branch,
in one place. A thin client wired live to `uvactive-unified-backend`; no
mock data, no Supabase, no local state pretending to be a database — every
screen calls a real endpoint and every destructive action is enforced
server-side, not just hidden client-side.

## Stack

- React 18 + TypeScript + Vite (SWC)
- Tailwind CSS + shadcn/ui (Radix primitives) — design tokens shared with
  every other UV Active surface, web and native
- TanStack Query for all server state (no Redux, no local caching of its own)
- Plain `fetch` client (`src/lib/api.ts`) — envelope unwrapping + token
  refresh built in, no axios dependency

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

On first run, log in with a super_admin account seeded via the backend's
`npm run seed`. Admin 2FA is mandatory with no bypass — first login for
any account walks you through TOTP enrollment automatically.

## Repo map

```
src/
  main.tsx / App.tsx        Entry point, router, providers
  index.css                 UV Active design tokens (HSL custom properties) — the
                             single source of truth this app's palette comes from
  lib/
    api.ts                  fetch client: envelope unwrapping, token refresh, ApiError
    auth-context.tsx        login / 2FA / logout / 30-min idle timeout
    types.ts                types mirroring the Prisma models this app touches
  hooks/admin/               one file per resource, all TanStack Query
  components/admin/          AdminLayout, AdminSidebar, AdminAuthGuard, StatCard,
                             ConfirmActionDialog, StatusBadge, GymFormDialog,
                             MemberDetailSheet
  pages/admin/                AdminLogin, AdminDashboard, Gyms, Members, Trainers,
                             Sessions, AdminUsers, AuditLog
  components/ui/              shadcn/ui primitives (Radix-based) — shared component
                             kit, don't hand-roll a new button/dialog/etc, extend these
```

## What's wired up

| Feature area | Route | Notes |
|---|---|---|
| Gym Management | `/admin/gyms` | create / edit / suspend / activate / delete |
| Member Oversight | `/admin/members` | search, gym-history timeline, session history, assign/release (override, audit-tagged), PIN reset, anonymize |
| Trainer Oversight | `/admin/trainers` | cross-gym list, independent suspend/activate |
| Session Oversight | `/admin/sessions` | browse + per-member HR/calorie/score drill-in |
| Admin User Management | `/admin/admins` | super_admin only, enforced by route guard **and** the API's own `@Auth('admin', ['super_admin'])` |
| Audit Log | `/admin/audit-log` | filterable by target type / actor id, CSV export |

`super_admin` vs `support` role gating hides the Admin Users nav item and
route entirely for `support` accounts — this UI never assumes the API will
block something just because a button happens to be hidden; the backend
enforces every one of these independently.

## Known gaps (backend-side, not this app)

- No `/admin/analytics` endpoint yet — the dashboard derives its numbers
  client-side from existing list endpoints. Fine at current volume.
- No admin-side session edit or cross-branch trainer profile edit.
- No `/admin/platform-settings` module (member cap, PIN policy,
  notification templates) — no Settings page here, since there's nowhere
  for it to save yet.

Nothing in this app fakes a feature with local-only state — where the API
doesn't support something, the corresponding UI simply isn't built.

## Deploying

Static site — build output is a plain `dist/` folder, deployable anywhere
that serves static files with an SPA fallback rewrite.

```bash
npm ci
npm run build      # → dist/
```

- **Vercel**: import the repo, framework preset "Vite" — `vercel.json`
  already has the SPA rewrite. Set `VITE_API_BASE_URL` as a project env var.
- **Render**: `render.yaml` in this folder deploys it as a static site
  (`Render dashboard → New → Blueprint`). Set `VITE_API_BASE_URL` there too.
- **Netlify / any static host**: same build command, same rewrite rule
  (`/* → /index.html`).

Point `VITE_API_BASE_URL` at wherever `uvactive-unified-backend` is
deployed, including the `/api/v1` prefix — this app never talks to
anything else.

**One lockfile only**: this repo ships a single `package-lock.json` (npm).
Don't add a `yarn.lock`, `pnpm-lock.yaml`, or `bun.lock` alongside it — most
platforms auto-detect the package manager from whichever lockfile is
present, and two different lockfiles in the same folder make that
ambiguous, which is a common cause of a build failing before your build
command even runs.

## Security notes

- 30-minute idle timeout enforced client-side (`src/lib/auth-context.tsx`),
  on top of whatever the API does with refresh-token expiry.
- Gym delete and member anonymize both require a confirm step; anonymize
  additionally requires re-entering your password, verified server-side.
- Every admin-initiated member assign/release is flagged in the UI as
  bypassing member consent, matching the `admin_override: true` audit tag
  the API writes.
