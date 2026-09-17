# Future roadmap

## Barcode scanning

Scan medicine and batch barcodes from a phone or desktop camera to reduce entry errors. Add a barcode field, scanner permission flow, and duplicate detection without changing FEFO rules.

## Supplier and purchase orders

Track supplier contacts, purchase orders, expected deliveries, and receiving events. Receiving should create batches through the existing batch service so expiry and tenant validation remain centralized.

## Sales analytics and forecasting

Aggregate dispensing history by medicine, category, and time period. Forecasting can use historical sell-through and reorder levels, but must never replace the expiry-safe sellable stock calculation.