# Setup guide

1. Provision or connect PostgreSQL and expose it as `DATABASE_URL`.
2. Set `SESSION_SECRET` to a long random value for shared or production environments.
3. Run `pnpm install`.
4. Apply schema with `pnpm --filter @workspace/db run push`.
5. Seed demo data with `pnpm --filter @workspace/scripts run seed`.
6. Start the API and web workflows, or run their package commands in separate shells.

OpenAPI changes require `pnpm --filter @workspace/api-spec run codegen` before the client or API is typechecked. The app treats expiry dates as date-only UTC calendar values, so local developer timezone changes do not alter expiry behavior.