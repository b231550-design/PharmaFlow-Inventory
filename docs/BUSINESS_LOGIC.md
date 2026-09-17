# Business logic

## Sellable stock

`sellableStock` is the sum of quantities from batches with `quantity > 0` and `expiryDate >= CURRENT_DATE`. Physical stock includes all quantities. Expired batches are never included in a sellable count, search result status, or dispensing allocation.

## FEFO

For a dispensing request, the API locks the medicine row and all eligible batches. It orders candidates by earliest expiry, then creation time, then ID. It allocates from the first batch until empty, continues to the next, and creates an immutable allocation snapshot. The entire transaction rolls back if stock is insufficient.

## Alerts

Upcoming alerts and expired alerts are separate queries. An upcoming alert is not an expired state: the UI shows days remaining for upcoming batches and clearly marks expired inventory as unavailable.

## Concurrency

`SELECT ... FOR UPDATE` serializes competing dispensing requests for the same medicine. Quantity deductions happen only after the availability check inside the same transaction as the dispensing record insert.