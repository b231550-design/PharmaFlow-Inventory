---
name: PostgreSQL date-only values
description: Raw pg queries in this workspace may return PostgreSQL date columns as JavaScript Date objects.
---

Normalize date-only values at the API boundary before formatting them as `YYYY-MM-DD` or calculating day differences.

**Why:** The Drizzle schema can declare a date column as string mode, but raw `pg` query results still arrived as Date objects in this workspace; string slicing produced weekday text and broke expiry calculations.

**How to apply:** Keep expiry comparisons in SQL with `CURRENT_DATE`, and normalize any date-only values returned from raw SQL before sending JSON.