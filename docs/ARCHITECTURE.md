# Ledgerly Architecture (Milestones 1–4)

## Stack
- **Next.js 15/16 App Router** on Vercel (serverless / edge-safe)
- **TypeScript strict**, **Tailwind v4** (design tokens via `@theme`)
- **JWT** (`jose`, HS256) — access (15 min) + rotating refresh (7 d)
- **bcryptjs** for password hashing (cost 12)
- **Zod** for input validation on every server action & route handler
- **Prisma + Supabase Postgres** — schema in `prisma/schema.prisma`, raw SQL in `prisma/migrations/`
- **In-memory store** in `lib/db/store.ts` for the preview; repositories swap 1:1 to Prisma

## Folder layout

```
app/
  (app)/              app shell — sidebar, header, all authenticated pages
    dashboard/        KPI dashboard
    institutes/       [Super Admin] tenants
    users/            user management
    audit-logs/       audit trail
    academic-years/ classes/ batches/ students/   academic core (M4)
    fees/ expenses/ accounts/ reports/            placeholders (M5–7)
    settings/         profile
  login/              public sign-in
  api/auth/{login,logout,refresh,me}   auth endpoints
  api/health          liveness
components/
  layout/{sidebar,header}
  ui/{button,input,card,badge,table,dialog}
  {page-header,stat-card}
lib/
  auth/{jwt,password,rbac,session}
  db/store.ts         in-memory repository (seed + query)
  env.ts utils.ts
middleware.ts         security headers + rate limit + edge auth gate
prisma/               schema + SQL migrations
docs/                 this file
```

## Authentication flow

1. `POST /api/auth/login` — Zod-validated; `verifyPassword` (bcrypt) with fixed-time compare from bcrypt; on 5 failed attempts, `lockedUntil = now + 15m`.
2. `createSession` mints an access JWT (15 min) and refresh JWT (7 d) with a unique `jti`; sets three cookies:
   - `lg_at` — HttpOnly access token
   - `lg_rt` — HttpOnly refresh token
   - `lg_csrf` — non-HttpOnly CSRF token echo (for double-submit)
3. `getCurrentUser` verifies access; on failure it calls `rotateSession` which invalidates the old `jti` and issues fresh access+refresh (rotation).
4. `POST /api/auth/logout` revokes the refresh `jti` server-side and clears cookies.

## RBAC

Central maps live in `lib/auth/rbac.ts`:

- `ROLES` — SUPER_ADMIN, INSTITUTE_ADMIN, ACCOUNTANT, CASHIER, VIEWER
- `PERMISSIONS` — granular strings (`fee:collect`, `report:view`, …)
- `ROLE_PERMISSIONS` — role → permissions[]

Every page & action:
- `requireUser()` – redirects to `/login` if no session.
- `hasPermission(perms, PERMISSION)` – gate at page & sidebar levels.
- `scopeByInstitute()` – every business query is filtered by `instituteId` unless the caller is `SUPER_ADMIN`. Super Admin sees all tenants.

## Multi-tenant isolation

- Users have `instituteId` (null only for Super Admin).
- Every business entity carries `instituteId` and is filtered before it leaves the repository.
- Sub-entity mutations re-check parent `instituteId` (e.g. batch's class must belong to the caller's institute).

## Middleware (`middleware.ts`, edge runtime)

- Adds security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera/mic/geo).
- Per-IP token-bucket rate limit on `/api/*` (60 req / 60 s / IP).
- Redirects unauthenticated app requests to `/login?next=…`.
- Returns 401 on unauthenticated `/api/*` calls.

## Audit logging

`pushAudit(...)` writes structured events to `store.auditLogs` (last 500). Every mutating action (login, logout, failed login, institute/user/class/batch/student create) emits an event with actor, entity, IP.

## Environment variables

See `.env.example`. Required in production:
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (each 32+ bytes random)
- `DATABASE_URL` (pooled), `DIRECT_URL` (migrations)
- `APP_URL`

## Milestones shipped

- **M1 Foundation** — design system, tokens, app shell, sidebar/header, dashboard, Prisma schema + SQL migration, env.
- **M2 Auth + RBAC** — custom JWT, bcrypt, rotating refresh, cookies, middleware, login page, `/api/auth/*` routes, account lock, rate limit, security headers, per-tenant isolation.
- **M3 Super Admin** — Institutes, Users (with role/tenant assignment), Audit logs.
- **M4 Academic core** — Academic Years, Classes, Batches, Students with tenant-scoped CRUD.

## Not yet built (later milestones)

- M5 Fees: structures, assignment, partial payments, receipts (PDF)
- M6 Expenses & Accounts: categories, vouchers, bank/cash ledgers, transactions
- M7 Reports: 10 reports + PDF/Excel export
- M8 Polish: e2e tests, README ops, Vercel config
