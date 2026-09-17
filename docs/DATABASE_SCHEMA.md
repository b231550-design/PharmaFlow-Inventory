# Database schema

## Tables

- `pharmacies`: tenant profile and configurable expiry alert threshold.
- `users`: pharmacy members, role, password hash, and tenant reference.
- `medicines`: catalog metadata and reorder level.
- `batches`: stock quantity, date-only expiry, pricing, and medicine reference.
- `dispensing_records`: immutable history with JSON batch allocation snapshots.

## Relationships and indexes

Users, medicines, batches, and dispensing records all reference a pharmacy. Batches reference medicines, and dispensing records reference both medicines and dispensing users. Pharmacy, medicine, expiry, and dispensing-time indexes support the main list and alert queries. A unique index prevents duplicate batch numbers for one medicine in one pharmacy.

## Constraints

Quantities are integers and are validated at the API boundary. The dispensing transaction locks candidate batches and never lets a deduction proceed when the requested quantity exceeds sellable stock. Historical records keep batch number, quantity, and expiry date snapshots even after stock reaches zero.

## Tenant isolation

No client-provided pharmacy ID is accepted. The pharmacy is derived from the authenticated session and included in every read and write predicate.