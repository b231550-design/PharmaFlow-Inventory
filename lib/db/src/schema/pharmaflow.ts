import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const pharmaciesTable = pgTable("pharmacies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  alertThresholdDays: integer("alert_threshold_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("owner"),
    pharmacyId: integer("pharmacy_id")
      .notNull()
      .references(() => pharmaciesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_pharmacy_idx").on(table.pharmacyId)],
);

export const medicinesTable = pgTable(
  "medicines",
  {
    id: serial("id").primaryKey(),
    pharmacyId: integer("pharmacy_id")
      .notNull()
      .references(() => pharmaciesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    genericName: text("generic_name").notNull().default(""),
    category: text("category").notNull().default("General"),
    manufacturer: text("manufacturer").notNull().default(""),
    unit: text("unit").notNull().default("units"),
    reorderLevel: integer("reorder_level").notNull().default(0),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("medicines_pharmacy_idx").on(table.pharmacyId),
    index("medicines_name_idx").on(table.name),
  ],
);

export const batchesTable = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    pharmacyId: integer("pharmacy_id")
      .notNull()
      .references(() => pharmaciesTable.id, { onDelete: "cascade" }),
    medicineId: integer("medicine_id")
      .notNull()
      .references(() => medicinesTable.id, { onDelete: "cascade" }),
    batchNumber: text("batch_number").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }).notNull().default("0"),
    sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batches_pharmacy_medicine_batch_unique").on(
      table.pharmacyId,
      table.medicineId,
      table.batchNumber,
    ),
    index("batches_expiry_idx").on(table.pharmacyId, table.expiryDate),
    index("batches_medicine_idx").on(table.medicineId),
  ],
);

export const dispensingRecordsTable = pgTable(
  "dispensing_records",
  {
    id: serial("id").primaryKey(),
    pharmacyId: integer("pharmacy_id")
      .notNull()
      .references(() => pharmaciesTable.id, { onDelete: "cascade" }),
    medicineId: integer("medicine_id")
      .notNull()
      .references(() => medicinesTable.id, { onDelete: "restrict" }),
    totalQuantity: integer("total_quantity").notNull(),
    items: jsonb("items").notNull(),
    dispensedBy: integer("dispensed_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("dispensing_pharmacy_idx").on(table.pharmacyId, table.dispensedAt),
    index("dispensing_medicine_idx").on(table.medicineId),
  ],
);

export const insertPharmacySchema = createInsertSchema(pharmaciesTable);
export const insertUserSchema = createInsertSchema(usersTable);
export const insertMedicineSchema = createInsertSchema(medicinesTable);
export const insertBatchSchema = createInsertSchema(batchesTable);
export const insertDispensingRecordSchema = createInsertSchema(dispensingRecordsTable);

export type Pharmacy = typeof pharmaciesTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type Medicine = typeof medicinesTable.$inferSelect;
export type Batch = typeof batchesTable.$inferSelect;
export type DispensingRecord = typeof dispensingRecordsTable.$inferSelect;