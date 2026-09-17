# AI handoff

PharmaFlow is a React/Vite + Express + PostgreSQL pharmacy inventory SaaS. The key product rule is safe FEFO dispensing: expired batches never count as sellable and are never deducted.

## Source of truth

- API contract: `lib/api-spec/openapi.yaml`
- Generated client: `lib/api-client-react`
- Generated validation: `lib/api-zod`
- Database schema: `lib/db/src/schema/pharmaflow.ts`
- API business logic: `artifacts/api-server/src/routes/pharmaflow.ts`
- Frontend: `artifacts/pharmaflow/src`

## Run

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/scripts run test
```

Demo login is `demo@pharmaflow.app` / `PharmaFlow123!`.

## Rules for safe changes

Keep every query tenant-scoped by the authenticated `pharmacyId`. Keep expiry comparisons date-only. Never move FEFO allocation into the browser. Any API contract change must update OpenAPI first and regenerate codegen. After changes, check auth, stock summaries, expiry alerts, the dispense transaction, and invalidation of affected frontend queries.