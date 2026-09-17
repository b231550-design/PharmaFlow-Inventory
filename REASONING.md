# PharmaFlow - Reasoning and Implementation Notes

## 1. Project Overview

PharmaFlow is a multi-pharmacy medicine inventory management application designed to help pharmacy teams manage medicines, batches, expiry dates, stock levels, and dispensing.

The main business requirement is to maintain accurate batch-level inventory while ensuring that expired medicines are never considered available for dispensing.

The application follows a full-stack architecture consisting of:

- React + Vite + TypeScript frontend
- Node.js + Express API
- PostgreSQL database
- Drizzle ORM for database schema and persistence
- OpenAPI as the API contract
- Generated Zod validation and React Query client helpers
- FEFO (First-Expiry-First-Out) dispensing logic

The implementation was designed around correctness of inventory operations, tenant isolation, secure authentication, and predictable expiry handling.

---

## 2. Core Design Approach

The implementation was divided into several main areas:

1. Authentication and pharmacy workspace isolation
2. Medicine and batch management
3. Inventory calculations
4. FEFO dispensing
5. Expiry monitoring and alerts
6. API validation and generated client contracts
7. Frontend dashboard and workflow UI
8. Automated testing and type checking

The most important principle was to keep inventory-related business rules on the server rather than relying on frontend behavior.

For example, the frontend may display which batch should be dispensed first, but the actual FEFO allocation is performed by the backend inside a database transaction.

This prevents a client-side UI decision from becoming the source of truth for stock changes.

---

## 3. Database and Data Model

The database is based on PostgreSQL.

The main entities are:

- `pharmacies`
- `users`
- `medicines`
- `batches`
- `dispensing_records`

Each medicine and batch is associated with a pharmacy through `pharmacy_id`.

This allows the application to support multiple pharmacy workspaces while keeping their inventory isolated.

### Batch-level inventory

Inventory is stored at batch level instead of only storing a single quantity against a medicine.

A batch contains:

- batch number
- expiry date
- quantity
- purchase price
- selling price
- medicine ID
- pharmacy ID
- creation/update timestamps

This structure is necessary because two batches of the same medicine can have different expiry dates and quantities.

---

## 4. Why Expiry Dates Use Calendar Dates

Expiry dates are stored as PostgreSQL `date` values rather than timestamps.

This was an intentional decision because medicine expiry is a calendar-date concept.

For example:

```text
2026-09-25