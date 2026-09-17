import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { allocateFefo } from "./fefo";

const batches = [
  { id: 1, batchNumber: "EXPIRED", expiryDate: "2026-08-01", quantity: 40 },
  { id: 2, batchNumber: "SOON", expiryDate: "2026-09-25", quantity: 50 },
  { id: 3, batchNumber: "LATER", expiryDate: "2026-12-15", quantity: 100 },
  { id: 4, batchNumber: "FUTURE", expiryDate: "2027-03-10", quantity: 75 },
];

test("FEFO ignores expired stock and selects earliest expiry first", () => {
  deepEqual(
    allocateFefo(batches, 120, "2026-09-17"),
    [
      { batchId: 2, batchNumber: "SOON", expiryDate: "2026-09-25", quantity: 50 },
      { batchId: 3, batchNumber: "LATER", expiryDate: "2026-12-15", quantity: 70 },
    ],
  );
});

test("FEFO rejects insufficient sellable stock without a partial allocation", () => {
  equal(allocateFefo(batches, 226, "2026-09-17").length, 0);
});

test("FEFO uses deterministic batch id ordering for equal expiry dates", () => {
  deepEqual(
    allocateFefo(
      [
        { id: 20, batchNumber: "SECOND", expiryDate: "2026-10-01", quantity: 2 },
        { id: 10, batchNumber: "FIRST", expiryDate: "2026-10-01", quantity: 2 },
      ],
      3,
      "2026-09-17",
    ),
    [
      { batchId: 10, batchNumber: "FIRST", expiryDate: "2026-10-01", quantity: 2 },
      { batchId: 20, batchNumber: "SECOND", expiryDate: "2026-10-01", quantity: 1 },
    ],
  );
});