# PharmaFlow - AI Development Log

> Reconstructed development prompts based on the implemented PharmaFlow
> project. These prompts document the development requirements, implementation
> iterations, testing, debugging, and refinement process.

---

# Prompt 1 — Initial Project Requirement

I want to build a complete pharmacy inventory management application
called "PharmaFlow".

The application should be designed for independent pharmacies and
should manage medicines, batches, stock quantities, expiry dates,
dispensing, alerts, and inventory history.

The application should not be just a static frontend mockup. I need a
persistent full-stack application with a real backend and PostgreSQL
database.

Use the following general technology stack:

- React
- TypeScript
- Vite
- Tailwind CSS
- Node.js
- Express
- PostgreSQL
- Drizzle ORM
- TanStack Query
- OpenAPI
- Zod

The application should support multiple pharmacy workspaces, so data
belonging to one pharmacy must never be accessible to another pharmacy.

Please first inspect the existing project structure and then design the
application architecture before implementing the complete feature set.

Important: inventory should be tracked at batch level because different
batches of the same medicine can have different expiry dates and
quantities.

The most important business requirement is FEFO:

First-Expiry-First-Out.

When dispensing a medicine, the system must always use the valid batch
with the earliest expiry date first.

Please implement this as a real backend business rule rather than only
displaying a recommendation in the frontend.

---

# Prompt 2 — Define the Database Architecture

Now design the PostgreSQL database for PharmaFlow.

I need a multi-tenant schema where each pharmacy has its own isolated
workspace.

Create the required entities for:

- pharmacies
- users
- medicines
- batches
- dispensing records

Every inventory-related record should be associated with a pharmacy.

Medicine records should contain the basic medicine information.

Batch records should contain at least:

- medicine ID
- pharmacy ID
- batch number
- expiry date
- quantity
- purchase price
- selling price
- timestamps

Dispensing records must preserve an allocation snapshot so that the
system can later show which batches were actually used during a
dispensing operation.

Use Drizzle ORM and PostgreSQL.

Make sure appropriate indexes and constraints are created.

Batch numbers should not be duplicated for the same medicine inside the
same pharmacy.

Do not rely only on frontend validation for these constraints.

---

# Prompt 3 — Authentication and Tenant Isolation

Implement authentication for PharmaFlow.

The application needs:

- registration
- login
- logout
- current-user endpoint
- protected API routes

During registration, create a pharmacy workspace and its owner.

Passwords must never be stored as plain text.

Use a secure password hashing mechanism such as Node.js scrypt with a
random salt.

Implement session authentication using a signed HttpOnly cookie.

The session cookie must not be accessible from client-side JavaScript.

Use secure cookie settings appropriate for production.

Most importantly, implement tenant isolation.

Every protected inventory query must be scoped to the authenticated
user's pharmacy ID.

A user from Pharmacy A must never be able to request or modify records
belonging to Pharmacy B simply by changing an ID in the URL.

Do this protection in the backend/database queries, not by hiding
records in the React UI.

---

# Prompt 4 — Medicine and Batch Management

Implement the medicine catalog and batch management functionality.

The API should support:

- creating medicines
- updating medicines
- deleting medicines
- listing medicines
- viewing medicine details
- adding batches
- editing batches
- deleting batches
- searching medicines
- searching inventory
- pagination
- sorting

Medicine inventory must be represented through its individual batches.

Do not treat medicine stock as one unstructured number.

A medicine can have multiple batches with different expiry dates.

Add appropriate validation for:

- required medicine fields
- positive or non-negative quantities
- valid expiry dates
- batch numbers
- prices

Prevent deletion of medicines when they still have stock.

Prevent deletion of non-empty batches.

All operations must remain pharmacy-tenant scoped.

---

# Prompt 5 — Expiry Date Handling

Implement expiry handling carefully.

Medicine expiry is a calendar-date concept, not a precise timestamp.

Use PostgreSQL's date type for expiry dates.

Do not convert expiry dates through JavaScript timezone calculations
when deciding whether a medicine is expired.

A batch should be considered sellable only when:

quantity > 0

AND

expiry_date >= CURRENT_DATE

Expired batches may still physically exist in the database, but they
must never be counted as sellable inventory.

Create separate concepts for:

- physical stock
- sellable stock
- expiring soon
- expired

Make sure the API and frontend consistently follow these rules.

---

# Prompt 6 — Inventory Summary

Implement the inventory summary API for the dashboard.

The dashboard should be able to display useful inventory metrics such as:

- total medicines
- total physical stock
- total sellable stock
- low-stock medicines
- expiring batches
- expired batches

Be careful not to count expired inventory as sellable stock.

For sellable stock, only include batches where:

quantity > 0

and:

expiry_date >= CURRENT_DATE

The inventory summary must also be pharmacy scoped.

Do not calculate critical inventory numbers only in the browser.

The backend/database should be the source of truth.

---

# Prompt 7 — FEFO Business Logic

Now implement the core FEFO dispensing logic.

The dispensing endpoint should receive a medicine and requested
quantity.

The server must find eligible batches for that medicine.

Eligibility:

- batch belongs to the authenticated pharmacy
- quantity > 0
- expiry_date >= CURRENT_DATE

Order eligible batches using:

1. earliest expiry date
2. creation timestamp
3. batch ID

The additional ordering fields are needed to make behavior deterministic
when multiple batches have the same expiry date.

The requested quantity must be allocated from the earliest-expiring
batch first.

If that batch does not contain enough stock, continue to the next
eligible batch.

For example:

Batch A:
expiry = 2026-10-01
quantity = 50

Batch B:
expiry = 2026-12-01
quantity = 100

Request:
120

Expected allocation:

Batch A = 50
Batch B = 70

Never use expired stock.

Never choose a later-expiring batch while an earlier eligible batch
still has stock.

---

# Prompt 8 — Make FEFO Transactional

The FEFO implementation needs to be safe under concurrent requests.

Do not simply:

1. query batches
2. calculate allocation
3. update quantities

without transaction protection.

Implement dispensing inside a PostgreSQL transaction.

The transaction should:

1. begin
2. lock the relevant medicine row
3. select eligible batches
4. lock candidate batch rows using FOR UPDATE
5. calculate total sellable stock
6. verify the complete requested quantity is available
7. calculate the FEFO allocation
8. deduct quantities
9. create the dispensing record
10. commit

If the requested quantity cannot be completely fulfilled:

- do not deduct partial stock
- do not create a dispensing record
- rollback the transaction
- return an appropriate insufficient-stock error

The operation must be all-or-nothing.

---

# Prompt 9 — Protect Against Expired Stock

Review the dispensing implementation specifically for expiry-related
edge cases.

I want to make sure that an expired batch can never be selected by FEFO.

Consider a case such as:

Batch A:
expiry = yesterday
quantity = 100

Batch B:
expiry = next month
quantity = 20

If the user requests 30 units, the system must NOT take 30 from
Batch A.

Instead, it should only consider Batch B.

If the request is larger than the total valid stock, the entire request
must fail.

Also make sure expired stock is excluded from:

- sellable stock summaries
- inventory search status
- FEFO allocation

but can still be represented as physical/expired inventory for
monitoring purposes.

---

# Prompt 10 — Implement Dispensing History

Create the dispensing history functionality.

Every successful dispensing operation should create an immutable
record containing:

- dispensing ID
- medicine
- requested quantity
- timestamp
- user/pharmacy context
- batch allocation snapshot

The allocation snapshot is important because future inventory changes
should not alter the historical record of what batches were used.

Create APIs for:

- listing dispensing history
- viewing a dispensing record
- creating a dispensing transaction

Keep all records pharmacy scoped.

---

# Prompt 11 — Expiry Alerts

Implement expiry monitoring.

Create separate endpoints for:

- upcoming expiring batches
- expired batches

An upcoming expiry should not be treated as an expired state.

For upcoming batches, return useful information such as:

- medicine
- batch number
- expiry date
- quantity
- days remaining

For expired batches, clearly identify them as unavailable for
dispensing.

Use date-only calculations and avoid timezone-related off-by-one
errors.

---

# Prompt 12 — OpenAPI Contract

I want the API to have a single source of truth.

Create/update:

lib/api-spec/openapi.yaml

Document all major API endpoints including:

Authentication:

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

Pharmacy:

GET/PATCH /api/pharmacy

Medicines:

GET/POST /api/medicines
GET/PATCH/DELETE /api/medicines/:medicineId

Batches:

GET /api/batches
POST /api/medicines/:medicineId/batches
GET/PATCH/DELETE /api/batches/:batchId

Inventory:

GET /api/inventory/summary
GET /api/inventory/search
GET /api/inventory/medicines/:medicineId

Dispensing:

GET/POST /api/dispensing
GET /api/dispensing/:dispensingId

Alerts:

GET /api/alerts/expiring
GET /api/alerts/expired

Define request and response schemas.

Use generated TypeScript/Zod/React Query helpers from this contract.

Any future API contract change should start by changing the OpenAPI
specification and then regenerating the generated code.

---

# Prompt 13 — Request Validation

Review all API routes for input validation.

Use generated Zod schemas where appropriate.

Validate:

- path parameters
- query parameters
- request bodies
- pagination values
- sorting fields
- quantities
- prices
- dates

Do not allow clients to inject arbitrary SQL sorting fields.

Use an allowlist for supported sorting options.

Invalid requests should return appropriate HTTP errors rather than
causing unexpected database failures.

---

# Prompt 14 — Build the React Frontend

Now build the React frontend for PharmaFlow.

Create a professional pharmacy inventory dashboard.

The frontend should include:

- login
- registration
- dashboard
- medicine catalog
- medicine detail
- batch management
- dispensing workflow
- expiry alerts
- dispensing history
- settings

Use:

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Wouter

The UI should be responsive and usable on desktop and smaller screens.

Use reusable components for:

- buttons
- forms
- tables
- dialogs
- badges
- cards
- loading states
- error states
- empty states

Keep the interface clean and suitable for a real pharmacy staff
workflow.

---

# Prompt 15 — Dashboard UX

Improve the dashboard so that the most important inventory information
is visible immediately.

Include cards/sections for:

- total medicines
- sellable stock
- low-stock items
- expiring inventory
- expired inventory

Provide recent activity and useful inventory information where
appropriate.

Do not display expired stock as if it were available for sale.

Make status labels visually clear.

The UI should make the distinction between:

In stock
Low stock
Out of stock
Expired

easy to understand.

---

# Prompt 16 — Medicine Catalog UX

Build the medicine catalog page.

The page should support:

- search
- pagination
- sorting
- medicine creation
- medicine editing
- medicine deletion
- viewing batch information

Display useful inventory status.

When showing stock, distinguish between physical inventory and
sellable inventory where relevant.

Make sure mutations refresh or invalidate the appropriate TanStack
Query caches so the UI does not show stale inventory data.

---

# Prompt 17 — Dispensing UI

Build the dispensing workflow.

The user should be able to:

1. select/search a medicine
2. see available sellable stock
3. enter a requested quantity
4. submit the dispensing request
5. receive success/error feedback
6. see the resulting allocation

The frontend may display eligible FEFO batches for transparency, but it
must NOT implement the authoritative FEFO allocation itself.

The backend must remain responsible for deciding which batches are
actually deducted.

After successful dispensing, refresh:

- medicine stock
- dashboard summary
- dispensing history
- relevant alerts

---

# Prompt 18 — Authentication UI

Implement the login and registration pages.

Registration should collect the necessary pharmacy and user details.

Login should authenticate through the API.

Protected application routes should require authentication.

When the session is missing or invalid, redirect the user to the
authentication flow.

After login, load the current user and pharmacy context.

Make sure logout clears the application state and session appropriately.

---

# Prompt 19 — Add Seed Data

Create realistic seed data for evaluation and demonstration.

The seed should create:

- a demo pharmacy
- a demo user
- multiple medicines
- multiple batches
- different expiry dates
- at least one expired batch
- a low-stock medicine
- enough batch variation to demonstrate FEFO

Create a predictable demo account.

Use:

Email:
demo@pharmaflow.app

Password:
PharmaFlow123!

Pharmacy:
Harbor Health Pharmacy

The seed should make it easy to demonstrate the important business
rules without manually entering many records.

---

# Prompt 20 — Create FEFO Unit Tests

Now write automated tests for the FEFO allocation logic.

Extract the FEFO allocation logic into a testable module rather than
testing everything only through the HTTP layer.

Create tests for at least:

1. expired-stock exclusion
2. earliest-expiry selection
3. multi-batch allocation
4. insufficient-stock handling
5. deterministic equal-expiry ordering

Example:

If batches are:

A:
expiry = 2026-10-01
quantity = 40

B:
expiry = 2026-11-01
quantity = 80

Request:
70

Expected:

A = 40
B = 30

Also test that an expired batch with a large quantity is completely
ignored.

---

# Prompt 21 — Test Insufficient Stock Atomicity

Add a specific test for insufficient stock.

Suppose:

Batch A:
sellable quantity = 30

Batch B:
sellable quantity = 20

Total sellable = 50

Request = 60

The system must reject the entire request.

Expected:

- no batch quantity changes
- no dispensing record
- no partial allocation

This is an all-or-nothing inventory operation.

Also make sure the API transaction follows the same rule.

---

# Prompt 22 — Test Equal Expiry Dates

Add deterministic ordering tests.

Suppose two eligible batches have exactly the same expiry date.

Use:

1. created timestamp
2. batch ID

as deterministic tie-breakers.

The result should be stable and reproducible.

The same input should always produce the same allocation.

---

# Prompt 23 — Run Type Checking and Tests

Now run the complete project checks.

Run:

pnpm run typecheck

pnpm --filter @workspace/api-server run typecheck

pnpm --filter @workspace/scripts run typecheck

pnpm --filter @workspace/scripts run test

Inspect every failure.

Do not simply suppress TypeScript errors or weaken the tests.

Fix the underlying problems while preserving the intended business
behavior.

After fixing issues, run the checks again.

---

# Prompt 24 — Review for Tenant Security

Perform a security review of all API routes.

For every medicine, batch, dispensing, inventory, alert, and pharmacy
query verify that the authenticated pharmacy ID is applied.

Test cases should include:

- user from Pharmacy A requesting Pharmacy B's medicine
- user from Pharmacy A requesting Pharmacy B's batch
- user from Pharmacy A requesting Pharmacy B's dispensing record
- manipulating IDs in URLs
- manipulating IDs in request bodies

All cross-tenant requests should fail or return not-found behavior
without exposing the other pharmacy's data.

Do not rely on the frontend for this protection.

---

# Prompt 25 — Review FEFO Concurrency

Perform a concurrency review of dispensing.

Consider two users simultaneously attempting to dispense stock from
the same medicine.

The implementation must not allow both transactions to deduct the
same units.

Review the transaction ordering and row locks.

Use:

SELECT ... FOR UPDATE

where necessary.

Ensure that:

- the medicine row is protected
- candidate batch rows are protected
- availability is checked after locks are acquired
- deductions occur in the same transaction
- the dispensing record is created in that transaction
- failures rollback the entire operation

---

# Prompt 26 — Review Date Handling

Review the entire application for timezone-related expiry bugs.

Expiry dates represent calendar dates.

Make sure the implementation consistently uses:

PostgreSQL date

and:

CURRENT_DATE

rather than converting medicine expiry into JavaScript timestamps
where that could cause a date to shift.

Test cases should include:

- today's expiry date
- yesterday's expiry date
- tomorrow's expiry date
- month boundary
- year boundary

A batch expiring today should still be eligible according to the
defined rule.

---

# Prompt 27 — API and Frontend Synchronization

Review the frontend and backend for mismatches.

Check:

- API request field names
- response field names
- nullable fields
- enum/status values
- pagination structures
- sorting parameters
- error responses

The OpenAPI specification should remain the source of truth.

Regenerate API clients and validation schemas after any contract
changes.

Then run TypeScript checks again.

---

# Prompt 28 — Improve Error Handling

Review application error handling.

The frontend should provide useful messages for:

- invalid login
- duplicate batch
- invalid quantity
- insufficient stock
- expired-stock dispensing attempt
- unauthorized requests
- not-found resources
- server errors

Do not expose sensitive backend information.

Errors should be understandable to pharmacy staff rather than raw
database errors.

---

# Prompt 29 — Review Inventory Edge Cases

Perform an edge-case review.

Consider:

1. medicine with no batches
2. medicine with only expired batches
3. medicine with zero quantity
4. medicine with one valid batch
5. medicine with multiple valid batches
6. request exactly equal to available stock
7. request one unit greater than available stock
8. multiple batches with same expiry date
9. batch expiring today
10. batch with zero quantity
11. deletion of a medicine with stock
12. deletion of a non-empty batch

Make sure the backend behavior is consistent and safe in every case.

---

# Prompt 30 — Improve Documentation

Create comprehensive project documentation.

Include:

- README
- architecture documentation
- database schema documentation
- business logic documentation
- API documentation
- frontend guide
- setup guide
- testing guide
- future roadmap
- AI handoff notes

Clearly document the most important rule:

Expired batches are never sellable and never deducted during dispensing.

Also document:

- FEFO
- transactions
- row locking
- tenant isolation
- authentication
- OpenAPI code generation
- date-only expiry handling
- test commands

---

# Prompt 31 — Final Code Review

Perform a final production-oriented code review.

Inspect:

- authentication
- authorization
- tenant isolation
- database schema
- inventory queries
- FEFO allocation
- transaction boundaries
- concurrency handling
- expiry handling
- API validation
- frontend query invalidation
- error handling
- TypeScript errors
- test coverage

Do not change working behavior unnecessarily.

If you find an issue, explain the problem, fix it, and rerun the relevant
tests.

The final implementation should keep the database as the source of
truth for inventory and should never trust the frontend to enforce
critical inventory rules.

---

# Prompt 32 — Final Verification

Before considering PharmaFlow complete, verify the following end-to-end
workflow:

1. Register a pharmacy.
2. Login.
3. Create medicines.
4. Add multiple batches.
5. Add batches with different expiry dates.
6. Add an expired batch.
7. Verify expired stock is not counted as sellable.
8. Search inventory.
9. Verify expiry alerts.
10. Dispense a quantity that requires multiple batches.
11. Verify FEFO allocation.
12. Verify batch quantities after dispensing.
13. Verify dispensing history.
14. Try dispensing more than available sellable stock.
15. Verify no partial deduction occurs.
16. Try dispensing expired-only inventory.
17. Verify the operation is rejected.
18. Verify another pharmacy cannot access the first pharmacy's data.
19. Run all TypeScript checks.
20. Run all FEFO tests.

Fix any issue discovered during this verification.

---

# Prompt 33 — Final Project State

The final PharmaFlow implementation should provide a persistent
multi-pharmacy pharmacy inventory management system.

The key requirements are:

- PostgreSQL persistence
- Drizzle ORM
- React/Vite frontend
- Express backend
- TypeScript
- OpenAPI contract
- generated Zod/API helpers
- secure authentication
- pharmacy tenant isolation
- medicine management
- batch management
- sellable stock calculations
- expiry alerts
- FEFO dispensing
- transactional inventory updates
- concurrency protection
- dispensing history
- seed data
- automated FEFO tests
- type checking
- complete documentation

The implementation should prioritize inventory correctness and data
integrity over frontend-only convenience.

The backend/database must remain the authoritative source for all
inventory-changing operations.