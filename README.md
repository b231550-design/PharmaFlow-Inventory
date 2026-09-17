# PharmaFlow

PharmaFlow is a multi-pharmacy inventory workspace for independent pharmacists. It keeps batch-level stock accurate, excludes expired medicines from sellable stock, and dispenses using First-Expiry-First-Out (FEFO).

## What is implemented

- Persistent PostgreSQL data through Drizzle ORM
- Tenant-isolated pharmacy workspaces
- Registration, login, logout, protected routes, secure password hashing, and signed HttpOnly sessions
- Medicine and batch management
- FEFO dispensing inside a database transaction
- Expired-batch protection and sellable stock summaries
- Search, pagination, and allowlisted sorting
- Expiry alerts and dispensing history
- Seed data for evaluation
- React/Vite frontend with responsive dashboard, catalog, dispense, alerts, history, and settings views

## Stack

- React, Vite, TypeScript, Wouter, TanStack Query, Tailwind CSS
- Node.js, Express 5, TypeScript
- PostgreSQL, Drizzle ORM
- OpenAPI 3.1 with generated React Query and Zod helpers

## Run locally

Prerequisites: Node.js 20+, pnpm, and a PostgreSQL database exposed as `DATABASE_URL`.

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
```

In separate shells:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/pharmaflow run dev
```

The managed workflows start both services with the correct ports and routing. `SESSION_SECRET` should be set for non-development environments.

## Demo account

- Email: `demo@pharmaflow.app`
- Password: `PharmaFlow123!`
- Pharmacy: Harbor Health Pharmacy

The seed includes multiple Paracetamol batches, one expired batch, a low-stock ORS item, and enough date variation to demonstrate FEFO.

## API

All routes are mounted under `/api`. The complete contract is in `lib/api-spec/openapi.yaml`; generated client hooks live in `lib/api-client-react`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a pharmacy workspace and owner |
| POST | `/api/auth/login` | Start a session |
| POST | `/api/auth/logout` | Clear the session |
| GET | `/api/auth/me` | Current user |
| GET/PATCH | `/api/pharmacy` | Read/update pharmacy profile |
| GET/POST | `/api/medicines` | Paginated catalog and create |
| GET/PATCH/DELETE | `/api/medicines/:medicineId` | Medicine detail and maintenance |
| GET | `/api/batches` | Paginated batch list |
| POST | `/api/medicines/:medicineId/batches` | Add a batch |
| GET/PATCH/DELETE | `/api/batches/:batchId` | Batch maintenance |
| GET | `/api/inventory/summary` | Dashboard metrics |
| GET | `/api/inventory/search` | Database-backed search |
| GET | `/api/inventory/medicines/:medicineId` | Sellable stock and eligible FEFO batches |
| GET/POST | `/api/dispensing` | History and atomic dispensing |
| GET | `/api/dispensing/:dispensingId` | Dispensing record detail |
| GET | `/api/alerts/expiring` | Upcoming expiry batches |
| GET | `/api/alerts/expired` | Expired batches |

## FEFO rules

The server treats expiry dates as calendar dates in UTC. A batch is eligible only when `expiry_date >= CURRENT_DATE` and `quantity > 0`. Eligible batches are ordered by expiry date, created timestamp, and ID. The requested quantity is fully validated before any deduction. A transaction locks the medicine and candidate batches, applies the allocation, and writes the dispensing record. If sellable stock is insufficient, the transaction rolls back without changing stock.

## Project structure

```text
artifacts/pharmaflow/     React application
artifacts/api-server/     Express API and FEFO service
lib/api-spec/             OpenAPI source of truth
lib/api-client-react/     Generated React Query client
lib/api-zod/              Generated validation schemas
lib/db/                   Drizzle schema and database client
scripts/src/seed.ts       Demo data
docs/                     Architecture, setup, API, and handoff notes
```

## Tests and checks

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/scripts run typecheck
pnpm --filter @workspace/scripts run test
```

The FEFO unit suite covers expired-stock exclusion, earliest-expiry ordering, split allocation, insufficient-stock atomicity, and deterministic tie-breaking. The documented API integration cases are listed in `docs/TESTING.md`.

## Roadmap

1. Barcode scanning for medicine and batch entry
2. Supplier and purchase order management
3. Sales analytics and inventory forecasting

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [API documentation](docs/API_DOCUMENTATION.md)
- [Business logic](docs/BUSINESS_LOGIC.md)
- [Frontend guide](docs/FRONTEND_GUIDE.md)
- [Setup guide](docs/SETUP_GUIDE.md)
- [Testing](docs/TESTING.md)
- [Future roadmap](docs/FUTURE_ROADMAP.md)
- [AI handoff](docs/AI_HANDOFF.md)