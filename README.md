# Ledgerly

Multi-tenant SaaS for institute **fees collection & expense tracking**. Built on Next.js 16 (App Router), TypeScript, Tailwind v4, custom JWT auth, and Prisma + Supabase Postgres.

> **Status:** Milestones 1–4 shipped (foundation, auth + RBAC, super-admin, academic core). Fees, expenses, reports come next.

## Quick start

```bash
bun install
cp .env.example .env
# fill in JWT secrets and Gmail SMTP settings
bun run dev
```

Open http://localhost:3000 and sign in with any demo account:

| Role | Email | Password |
|---|---|---|
| Super Admin | super@ledgerly.app | Password123! |
| Institute Admin | admin@greenwood.edu | Password123! |
| Accountant | accountant@greenwood.edu | Password123! |
| Cashier | cashier@greenwood.edu | Password123! |
| Viewer | viewer@greenwood.edu | Password123! |

The preview uses an in-memory store (`lib/db/store.ts`) so it runs without a DB. To wire real data, apply `prisma/migrations/0001_init/migration.sql` in the Supabase SQL editor and swap the store for Prisma repositories — the shapes match 1:1.

## Deploy to Vercel

1. Import the repo into Vercel.
2. Set env vars from `.env.example`.
3. Deploy — everything is serverless-safe (no filesystem writes, no long-running processes).

For password-reset emails, set `GOOGLE_EMAIL` to the Gmail sender address and
`GOOGLE_APP_PASSWORD` to its 16-character Google App Password. Also set
`APP_URL` to the deployed HTTPS URL so reset links point to production.

## Docs

- Architecture, folder layout, security model → [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Data model → [`prisma/schema.prisma`](./prisma/schema.prisma)
- SQL migration → [`prisma/migrations/0001_init/migration.sql`](./prisma/migrations/0001_init/migration.sql)
