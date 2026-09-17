# PharmaFlow

PharmaFlow is a multi-pharmacy inventory workspace that keeps batch stock accurate and makes expiry-safe FEFO dispensing fast.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/pharmaflow run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed the demo pharmacy and inventory
- Required env: `DATABASE_URL` and `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pharmaflow/src` — React/Vite application
- `artifacts/api-server/src/routes/pharmaflow.ts` — auth, tenant isolation, inventory, FEFO, and alerts
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/pharmaflow.ts` — persistent PostgreSQL schema
- `scripts/src/seed.ts` — safe demo data seed
- `docs/` — setup, API, architecture, business logic, testing, and AI handoff

## Architecture decisions

- Expiry dates are calendar-only PostgreSQL dates compared against `CURRENT_DATE`.
- Sellable stock and FEFO eligibility are computed on the server; expired stock is never eligible.
- Dispensing locks the medicine and eligible batches in a transaction before updating quantities and creating history.
- Auth uses scrypt password hashes and a signed HttpOnly session cookie because this workspace explicitly requires local credentials.
- All inventory queries derive `pharmacyId` from the session; clients cannot choose a tenant.

## Product

- Register or log into a pharmacy workspace
- Manage medicines and batch stock
- Search, sort, and paginate inventory
- Review sellable stock and expiry risk
- Dispense with FEFO allocation and audit history
- Update pharmacy settings

## User preferences

- No additional preferences recorded.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- Run schema push before starting the API on a fresh database.
- Never move FEFO logic into the frontend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
