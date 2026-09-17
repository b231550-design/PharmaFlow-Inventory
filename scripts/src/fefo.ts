export type FefoBatch = {
  id: number;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
};

export type FefoAllocation = {
  batchId: number;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
};

export function allocateFefo(batches: FefoBatch[], requested: number, businessDate: string): FefoAllocation[] {
  const eligible = batches
    .filter((batch) => batch.quantity > 0 && batch.expiryDate >= businessDate)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id - b.id);
  if (eligible.reduce((sum, batch) => sum + batch.quantity, 0) < requested) return [];

  let remaining = requested;
  const allocations: FefoAllocation[] = [];
  for (const batch of eligible) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, batch.quantity);
    allocations.push({ batchId: batch.id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantity });
    remaining -= quantity;
  }
  return allocations;
}