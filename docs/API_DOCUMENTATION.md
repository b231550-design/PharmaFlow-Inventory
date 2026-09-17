# API documentation

Base URL: `/api`. Protected endpoints require the `pharmaflow_session` HttpOnly cookie created by login or registration. Errors use `{ "error": "message" }`.

## Auth

- `POST /auth/register` — body `{ name, email, password, pharmacyName }`; returns `{ user, pharmacy }`.
- `POST /auth/login` — body `{ email, password }`; returns `{ user, pharmacy }`.
- `POST /auth/logout` — clears the cookie and returns `204`.
- `GET /auth/me` — returns the current user.

## Pharmacy

- `GET /pharmacy` — returns the current pharmacy profile.
- `PATCH /pharmacy` — accepts any of `name`, `address`, `phone`, `alertThresholdDays`.

## Medicines and batches

- `GET /medicines?page=1&limit=10&search=para&sortBy=name&order=asc` — returns `{ items, pagination }`.
- `POST /medicines` — accepts `name`, `genericName`, `category`, `manufacturer`, `unit`, `reorderLevel`, and optional `description`.
- `GET/PATCH/DELETE /medicines/:medicineId` — detail, maintenance, and safe deletion.
- `GET /batches?page=1&limit=10&search=para&sortBy=expiryDate&order=asc` — returns `{ items, pagination }`.
- `POST /medicines/:medicineId/batches` — accepts `batchNumber`, `expiryDate`, `quantity`, `purchasePrice`, and `sellingPrice`.
- `GET/PATCH/DELETE /batches/:batchId` — batch detail, maintenance, and empty-batch deletion.

## Inventory and dispensing

- `GET /inventory/summary` — dashboard totals and recent dispensing.
- `GET /inventory/search?search=paracetamol&page=1&limit=10` — case-insensitive medicine search.
- `GET /inventory/medicines/:medicineId` — medicine summary plus eligible FEFO batches.
- `POST /dispensing` — body `{ medicineId, quantity }`; returns allocation items and remaining sellable stock. Returns `409` when sellable stock is insufficient.
- `GET /dispensing?page=1&limit=10&order=desc` — dispensing history.
- `GET /dispensing/:dispensingId` — one immutable dispensing record.

## Alerts

- `GET /alerts/expiring?days=30&page=1&limit=10` — positive-quantity batches expiring between today and the threshold.
- `GET /alerts/expired?page=1&limit=10` — positive-quantity batches before today.

Pagination responses contain `page`, `limit`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. Sort fields are allowlisted by endpoint.