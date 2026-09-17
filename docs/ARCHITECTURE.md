# Architecture

PharmaFlow is a pnpm monorepo with a React/Vite client, a shared Express API, generated OpenAPI helpers, and a PostgreSQL database.

## Request flow

1. The browser calls `/api` through the shared proxy.
2. Express reads the signed HttpOnly session cookie.
3. The auth middleware resolves the user and pharmacy tenant.
4. Route handlers validate request bodies, path parameters, and query parameters using generated Zod schemas.
5. SQL queries always include `pharmacy_id` for tenant isolation.
6. Responses return the shapes defined in `lib/api-spec/openapi.yaml`.

## Important decisions

- PostgreSQL/Drizzle is used because it is the provisioned persistent database in this workspace; the API contract remains database-agnostic.
- Date-only expiry values use PostgreSQL `date` and are compared with `CURRENT_DATE`, not JavaScript timestamps.
- Auth uses a signed, HttpOnly cookie session and scrypt password hashes. The cookie is never exposed to client JavaScript.
- FEFO is a backend transaction, not a client-side suggestion.
- Generated client and Zod code comes from the OpenAPI file and must be regenerated after contract changes.