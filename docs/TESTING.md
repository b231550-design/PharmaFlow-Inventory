# Testing

Run workspace checks with:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/scripts run typecheck
pnpm --filter @workspace/scripts run test
```

The current automated FEFO suite covers registration-independent business logic: expired-stock exclusion, earliest-expiry selection, multi-batch allocation, all-or-nothing insufficient stock, and deterministic equal-date ordering. API integration coverage should use a separate test `DATABASE_URL` and cover registration, valid and invalid login, protected routes, medicine and batch creation, tenant isolation, case-insensitive search, pagination, sorting, sellable stock excluding expired batches, expired-stock rejection, non-negative quantities, and dispensing history snapshots.

The transaction path is intentionally isolated in the API route and uses row locks; tests should assert both the response allocation and the resulting batch quantities.