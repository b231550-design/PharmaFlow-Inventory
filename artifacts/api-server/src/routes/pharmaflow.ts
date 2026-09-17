import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import {
  BatchInput,
  UpdateBatchBody,
  CreateBatchBody,
  CreateBatchParams,
  CreateMedicineBody,
  CreateMedicineResponse,
  DeleteBatchParams,
  DeleteMedicineParams,
  DispenseBody,
  GetBatchParams,
  GetDispensingParams,
  GetMedicineInventoryParams,
  GetMedicineParams,
  ListBatchesQueryParams,
  ListDispensingQueryParams,
  ListExpiredAlertsQueryParams,
  ListExpiringAlertsQueryParams,
  ListMedicinesQueryParams,
  LoginBody,
  RegisterBody,
  SearchInventoryQueryParams,
  UpdateMedicineBody,
  UpdateMedicineParams,
  UpdatePharmacyBody,
} from "@workspace/api-zod";

type SessionPayload = { userId: number; expiresAt: number };
type Context = {
  userId: number;
  pharmacyId: number;
  name: string;
  email: string;
  role: string;
};
type AuthedRequest = Request & { context?: Context };

const router: IRouter = Router();
const COOKIE = "pharmaflow_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  (process.env.NODE_ENV === "production" ? "" : "local-development-only-change-me");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(date: string, base = today()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000);
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeSession(value: string): SessionPayload | null {
  const [body, signature] = value.split(".");
  if (!body || !signature || !SESSION_SECRET) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    return parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function setSession(res: Response, userId: number): void {
  const value = encodeSession({ userId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

function clearSession(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function readCookie(req: Request): string | null {
  const header = req.headers.cookie ?? "";
  const match = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : null;
}

async function loadContext(req: Request): Promise<Context | null> {
  const session = readCookie(req);
  const payload = session ? decodeSession(session) : null;
  if (!payload) return null;
  const result = await pool.query<Context>(
    `SELECT u.id AS "userId", u.name, u.email, u.role, u.pharmacy_id AS "pharmacyId"
     FROM users u WHERE u.id = $1`,
    [payload.userId],
  );
  return result.rows[0] ?? null;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const context = await loadContext(req);
  if (!context) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.context = context;
  next();
}

function ctx(req: AuthedRequest): Context {
  if (!req.context) throw new Error("Missing request context");
  return req.context;
}

function pageInfo(page: number, limit: number, totalItems: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function medicineStatus(sellable: number, reorderLevel: number, activeBatches: number, expiredBatches: number) {
  if (sellable === 0 && expiredBatches > 0 && activeBatches === 0) return "expired_only";
  if (sellable === 0) return "out_of_stock";
  if (sellable <= reorderLevel) return "low_stock";
  return "in_stock";
}

function mapMedicine(row: Record<string, unknown>) {
  const sellableStock = asNumber(row.sellable_stock);
  const physicalStock = asNumber(row.physical_stock);
  const activeBatches = asNumber(row.active_batches);
  const expiredBatches = asNumber(row.expired_batches);
  const reorderLevel = asNumber(row.reorder_level);
  return {
    id: asNumber(row.id),
    name: String(row.name),
    genericName: String(row.generic_name ?? ""),
    category: String(row.category ?? ""),
    manufacturer: String(row.manufacturer ?? ""),
    unit: String(row.unit ?? "units"),
    reorderLevel,
    description: String(row.description ?? ""),
    sellableStock,
    physicalStock,
    activeBatches,
    expiredBatches,
    earliestExpiry: row.earliest_expiry ? dateOnly(row.earliest_expiry) : null,
    status: medicineStatus(sellableStock, reorderLevel, activeBatches, expiredBatches),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapBatch(row: Record<string, unknown>) {
  const expiryDate = dateOnly(row.expiry_date);
  const daysRemaining = daysBetween(expiryDate);
  const quantity = asNumber(row.quantity);
  const status = quantity <= 0 ? "depleted" : daysRemaining < 0 ? "expired" : daysRemaining <= 30 ? "expiring_soon" : "active";
  return {
    id: asNumber(row.id),
    medicineId: asNumber(row.medicine_id),
    medicineName: String(row.medicine_name ?? ""),
    batchNumber: String(row.batch_number),
    expiryDate,
    quantity,
    purchasePrice: asNumber(row.purchase_price),
    sellingPrice: asNumber(row.selling_price),
    status,
    daysRemaining,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

const medicineSelect = `
  SELECT m.*,
    COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id = m.id AND b.pharmacy_id = m.pharmacy_id AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE), 0) AS sellable_stock,
    COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id = m.id AND b.pharmacy_id = m.pharmacy_id), 0) AS physical_stock,
    COALESCE((SELECT COUNT(*) FROM batches b WHERE b.medicine_id = m.id AND b.pharmacy_id = m.pharmacy_id AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE), 0) AS active_batches,
    COALESCE((SELECT COUNT(*) FROM batches b WHERE b.medicine_id = m.id AND b.pharmacy_id = m.pharmacy_id AND b.expiry_date < CURRENT_DATE AND b.quantity > 0), 0) AS expired_batches,
    (SELECT MIN(b.expiry_date) FROM batches b WHERE b.medicine_id = m.id AND b.pharmacy_id = m.pharmacy_id AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE) AS earliest_expiry
  FROM medicines m
`;

function parseId(value: string | string[] | undefined): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pharmacy = await client.query<{ id: number; name: string; address: string; phone: string; alertThresholdDays: number }>(
      `INSERT INTO pharmacies (name) VALUES ($1) RETURNING id, name, address, phone, alert_threshold_days AS "alertThresholdDays"`,
      [data.pharmacyName],
    );
    const created = await client.query<{ id: number; name: string; email: string; role: string; pharmacyId: number }>(
      `INSERT INTO users (name, email, password_hash, role, pharmacy_id)
       VALUES ($1, LOWER($2), $3, 'owner', $4)
       RETURNING id, name, email, role, pharmacy_id AS "pharmacyId"`,
      [data.name, data.email, hashPassword(data.password), pharmacy.rows[0].id],
    );
    await client.query("COMMIT");
    setSession(res, created.rows[0].id);
    res.status(201).json({ user: created.rows[0], pharmacy: pharmacy.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error && error.message.includes("users_email_unique") ? "Email already registered" : "Unable to register";
    res.status(400).json({ error: message });
  } finally {
    client.release();
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await pool.query<Record<string, unknown>>(
    `SELECT u.id, u.name, u.email, u.role, u.password_hash, u.pharmacy_id,
            p.name AS pharmacy_name, p.address, p.phone, p.alert_threshold_days
     FROM users u JOIN pharmacies p ON p.id = u.pharmacy_id WHERE LOWER(u.email) = LOWER($1)`,
    [parsed.data.email],
  );
  const user = result.rows[0];
  if (!user || !verifyPassword(parsed.data.password, String(user.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  setSession(res, asNumber(user.id));
  res.json({
    user: { id: asNumber(user.id), name: String(user.name), email: String(user.email), role: String(user.role), pharmacyId: asNumber(user.pharmacy_id) },
    pharmacy: { id: asNumber(user.pharmacy_id), name: String(user.pharmacy_name), address: String(user.address), phone: String(user.phone), alertThresholdDays: asNumber(user.alert_threshold_days) },
  });
});

router.post("/auth/logout", (_req, res): void => {
  clearSession(res);
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const current = ctx(req);
  res.json({ id: current.userId, name: current.name, email: current.email, role: current.role, pharmacyId: current.pharmacyId });
});

router.get("/pharmacy", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const result = await pool.query(
    `SELECT id, name, address, phone, alert_threshold_days AS "alertThresholdDays" FROM pharmacies WHERE id = $1`,
    [ctx(req).pharmacyId],
  );
  res.json(result.rows[0]);
});

router.patch("/pharmacy", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = UpdatePharmacyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const fields = Object.entries(parsed.data);
  if (!fields.length) {
    res.status(400).json({ error: "No changes supplied" });
    return;
  }
  const columns: Record<string, string> = { name: "name", address: "address", phone: "phone", alertThresholdDays: "alert_threshold_days" };
  const assignments = fields.map(([key], index) => `${columns[key]} = $${index + 1}`);
  const values = fields.map(([, value]) => value);
  values.push(ctx(req).pharmacyId);
  const result = await pool.query(
    `UPDATE pharmacies SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${values.length}
     RETURNING id, name, address, phone, alert_threshold_days AS "alertThresholdDays"`,
    values,
  );
  res.json(result.rows[0]);
});

router.get("/medicines", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ListMedicinesQueryParams.parse(req.query);
  const search = parsed.search?.trim() ?? "";
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;
  const order = parsed.order === "desc" ? "DESC" : "ASC";
  const sort = parsed.sortBy === "createdAt" ? "m.created_at" : parsed.sortBy === "sellableStock" ? "sellable_stock" : "m.name";
  const filter = search ? `AND (m.name ILIKE $2 OR m.generic_name ILIKE $2 OR m.manufacturer ILIKE $2)` : "";
  const params: unknown[] = [ctx(req).pharmacyId];
  if (search) params.push(`%${search}%`);
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM medicines m WHERE m.pharmacy_id = $1 ${filter}`, params);
  const rows = await pool.query<Record<string, unknown>>(
    `${medicineSelect} WHERE m.pharmacy_id = $1 ${filter} ORDER BY ${sort} ${order}, m.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  res.json({ items: rows.rows.map(mapMedicine), pagination: pageInfo(page, limit, asNumber(count.rows[0].count)) });
});

router.post("/medicines", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = CreateMedicineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const created = await pool.query(
    `INSERT INTO medicines (pharmacy_id, name, generic_name, category, manufacturer, unit, reorder_level, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ctx(req).pharmacyId, d.name, d.genericName, d.category, d.manufacturer, d.unit, d.reorderLevel, d.description ?? ""],
  );
  const row = await pool.query<Record<string, unknown>>(`${medicineSelect} WHERE m.id = $1 AND m.pharmacy_id = $2`, [created.rows[0].id, ctx(req).pharmacyId]);
  res.status(201).json(mapMedicine(row.rows[0]));
});

router.get("/medicines/:medicineId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = parseId(req.params.medicineId);
  const medicine = await pool.query<Record<string, unknown>>(`${medicineSelect} WHERE m.id = $1 AND m.pharmacy_id = $2`, [id, ctx(req).pharmacyId]);
  if (!medicine.rows[0]) {
    res.status(404).json({ error: "Medicine not found" });
    return;
  }
  const batches = await pool.query<Record<string, unknown>>(
    `SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id = b.medicine_id
     WHERE b.medicine_id = $1 AND b.pharmacy_id = $2 ORDER BY b.expiry_date ASC, b.created_at ASC, b.id ASC`,
    [id, ctx(req).pharmacyId],
  );
  res.json({ ...mapMedicine(medicine.rows[0]), batches: batches.rows.map(mapBatch) });
});

router.patch("/medicines/:medicineId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const params = UpdateMedicineParams.safeParse(req.params);
  const parsed = UpdateMedicineBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid medicine update" });
    return;
  }
  const d = parsed.data;
  const fields = Object.entries(d);
  if (!fields.length) {
    res.status(400).json({ error: "No changes supplied" });
    return;
  }
  const columns: Record<string, string> = { name: "name", genericName: "generic_name", category: "category", manufacturer: "manufacturer", unit: "unit", reorderLevel: "reorder_level", description: "description" };
  const assignments = fields.map(([key], i) => `${columns[key]} = $${i + 1}`);
  const values = fields.map(([, value]) => value);
  values.push(parseId(req.params.medicineId), ctx(req).pharmacyId);
  const updated = await pool.query(`UPDATE medicines SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${values.length - 1} AND pharmacy_id = $${values.length} RETURNING id`, values);
  if (!updated.rows[0]) {
    res.status(404).json({ error: "Medicine not found" });
    return;
  }
  const row = await pool.query<Record<string, unknown>>(`${medicineSelect} WHERE m.id = $1 AND m.pharmacy_id = $2`, [values[values.length - 2], ctx(req).pharmacyId]);
  res.json(mapMedicine(row.rows[0]));
});

router.delete("/medicines/:medicineId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = DeleteMedicineParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await pool.query(
    `DELETE FROM medicines WHERE id = $1 AND pharmacy_id = $2
     AND NOT EXISTS (SELECT 1 FROM batches WHERE medicine_id = medicines.id AND quantity > 0)
     RETURNING id`,
    [parseId(req.params.medicineId), ctx(req).pharmacyId],
  );
  if (!result.rows[0]) {
    res.status(409).json({ error: "Medicine cannot be deleted while it has stock" });
    return;
  }
  res.sendStatus(204);
});

router.get("/batches", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ListBatchesQueryParams.parse(req.query);
  const search = parsed.search?.trim() ?? "";
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;
  const order = parsed.order === "desc" ? "DESC" : "ASC";
  const sort = parsed.sortBy === "quantity" ? "b.quantity" : parsed.sortBy === "batchNumber" ? "b.batch_number" : "b.expiry_date";
  const filter = search ? `AND (b.batch_number ILIKE $2 OR m.name ILIKE $2)` : "";
  const params: unknown[] = [ctx(req).pharmacyId];
  if (search) params.push(`%${search}%`);
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.pharmacy_id=$1 ${filter}`, params);
  const rows = await pool.query<Record<string, unknown>>(
    `SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id
     WHERE b.pharmacy_id=$1 ${filter} ORDER BY ${sort} ${order}, b.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  res.json({ items: rows.rows.map(mapBatch), pagination: pageInfo(page, limit, asNumber(count.rows[0].count)) });
});

router.post("/medicines/:medicineId/batches", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const params = CreateBatchParams.safeParse(req.params);
  const parsed = CreateBatchBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid batch" });
    return;
  }
  const d = parsed.data;
  const medicine = await pool.query<{ id: number }>("SELECT id FROM medicines WHERE id=$1 AND pharmacy_id=$2", [parseId(req.params.medicineId), ctx(req).pharmacyId]);
  if (!medicine.rows[0]) {
    res.status(404).json({ error: "Medicine not found" });
    return;
  }
  try {
    const created = await pool.query<{ id: number }>(
      `INSERT INTO batches (pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx(req).pharmacyId, medicine.rows[0].id, d.batchNumber, d.expiryDate, d.quantity, d.purchasePrice, d.sellingPrice],
    );
    const row = await pool.query<Record<string, unknown>>(`SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.id=$1`, [created.rows[0].id]);
    res.status(201).json(mapBatch(row.rows[0]));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error && error.message.includes("unique") ? "Batch number already exists for this medicine" : "Unable to create batch" });
  }
});

router.get("/batches/:batchId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = GetBatchParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await pool.query<Record<string, unknown>>(`SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.id=$1 AND b.pharmacy_id=$2`, [parseId(req.params.batchId), ctx(req).pharmacyId]);
  if (!row.rows[0]) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  res.json(mapBatch(row.rows[0]));
});

router.patch("/batches/:batchId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = UpdateBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const fields = Object.entries(parsed.data);
  if (!fields.length) {
    res.status(400).json({ error: "No changes supplied" });
    return;
  }
  const columns: Record<string, string> = { batchNumber: "batch_number", expiryDate: "expiry_date", quantity: "quantity", purchasePrice: "purchase_price", sellingPrice: "selling_price" };
  const assignments = fields.map(([key], i) => `${columns[key]}=$${i + 1}`);
  const values = fields.map(([, value]) => value);
  values.push(parseId(req.params.batchId), ctx(req).pharmacyId);
  const updated = await pool.query(`UPDATE batches SET ${assignments.join(", ")}, updated_at=NOW() WHERE id=$${values.length - 1} AND pharmacy_id=$${values.length} RETURNING id`, values);
  if (!updated.rows[0]) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  const row = await pool.query<Record<string, unknown>>(`SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.id=$1`, [values[values.length - 2]]);
  res.json(mapBatch(row.rows[0]));
});

router.delete("/batches/:batchId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = DeleteBatchParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await pool.query("DELETE FROM batches WHERE id=$1 AND pharmacy_id=$2 AND quantity=0 RETURNING id", [parseId(req.params.batchId), ctx(req).pharmacyId]);
  if (!result.rows[0]) {
    res.status(409).json({ error: "Only empty batches can be deleted" });
    return;
  }
  res.sendStatus(204);
});

router.get("/inventory/summary", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const pharmacyId = ctx(req).pharmacyId;
  const metrics = await pool.query<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM medicines WHERE pharmacy_id=$1) AS total_medicines,
       (SELECT COALESCE(SUM(b.quantity),0) FROM batches b WHERE b.pharmacy_id=$1 AND b.quantity>0 AND b.expiry_date>=CURRENT_DATE) AS total_sellable_stock,
       (SELECT COUNT(*) FROM (${medicineSelect} WHERE m.pharmacy_id=$1) inventory WHERE sellable_stock <= reorder_level) AS low_stock_medicines,
       (SELECT COUNT(*) FROM batches WHERE pharmacy_id=$1 AND quantity>0 AND expiry_date>=CURRENT_DATE AND expiry_date<=CURRENT_DATE + INTERVAL '30 days') AS expiring_soon_batches,
       (SELECT COUNT(*) FROM batches WHERE pharmacy_id=$1 AND quantity>0 AND expiry_date<CURRENT_DATE) AS expired_batches`,
    [pharmacyId],
  );
  const recent = await pool.query<Record<string, unknown>>(
    `SELECT d.*, m.name AS medicine_name, u.name AS dispensed_by FROM dispensing_records d
     JOIN medicines m ON m.id=d.medicine_id JOIN users u ON u.id=d.dispensed_by
     WHERE d.pharmacy_id=$1 ORDER BY d.dispensed_at DESC LIMIT 5`,
    [pharmacyId],
  );
  res.json({
    totalMedicines: asNumber(metrics.rows[0].total_medicines),
    totalSellableStock: asNumber(metrics.rows[0].total_sellable_stock),
    lowStockMedicines: asNumber(metrics.rows[0].low_stock_medicines),
    expiringSoonBatches: asNumber(metrics.rows[0].expiring_soon_batches),
    expiredBatches: asNumber(metrics.rows[0].expired_batches),
    recentDispensing: recent.rows.map((row) => mapDispensing(row)),
  });
});

router.get("/inventory/search", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = SearchInventoryQueryParams.parse(req.query);
  const search = parsed.search?.trim() ?? "";
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;
  const params: unknown[] = [ctx(req).pharmacyId, `%${search}%`];
  const count = await pool.query<{ count: string }>("SELECT COUNT(*)::int AS count FROM medicines m WHERE m.pharmacy_id=$1 AND (m.name ILIKE $2 OR m.generic_name ILIKE $2 OR m.manufacturer ILIKE $2)", params);
  const rows = await pool.query<Record<string, unknown>>(`${medicineSelect} WHERE m.pharmacy_id=$1 AND (m.name ILIKE $2 OR m.generic_name ILIKE $2 OR m.manufacturer ILIKE $2) ORDER BY m.name ASC LIMIT $3 OFFSET $4`, [...params, limit, (page - 1) * limit]);
  res.json({ items: rows.rows.map(mapMedicine), pagination: pageInfo(page, limit, asNumber(count.rows[0].count)) });
});

router.get("/inventory/medicines/:medicineId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = GetMedicineInventoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = parseId(req.params.medicineId);
  const medicine = await pool.query<Record<string, unknown>>(`${medicineSelect} WHERE m.id=$1 AND m.pharmacy_id=$2`, [id, ctx(req).pharmacyId]);
  if (!medicine.rows[0]) {
    res.status(404).json({ error: "Medicine not found" });
    return;
  }
  const batches = await pool.query<Record<string, unknown>>(`SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.medicine_id=$1 AND b.pharmacy_id=$2 AND b.quantity>0 AND b.expiry_date>=CURRENT_DATE ORDER BY b.expiry_date ASC,b.created_at ASC,b.id ASC`, [id, ctx(req).pharmacyId]);
  res.json({ medicine: mapMedicine(medicine.rows[0]), eligibleBatches: batches.rows.map(mapBatch) });
});

function mapDispensing(row: Record<string, unknown>) {
  return {
    id: asNumber(row.id),
    medicineId: asNumber(row.medicine_id),
    medicineName: String(row.medicine_name ?? ""),
    totalQuantity: asNumber(row.total_quantity),
    items: Array.isArray(row.items) ? row.items : [],
    dispensedBy: String(row.dispensed_by_name ?? row.dispensed_by ?? ""),
    dispensedAt: new Date(String(row.dispensed_at)).toISOString(),
    remainingSellableStock: asNumber(row.remaining_sellable_stock),
  };
}

router.get("/dispensing", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = ListDispensingQueryParams.parse(req.query);
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;
  const order = parsed.order === "desc" ? "DESC" : "ASC";
  const count = await pool.query<{ count: string }>("SELECT COUNT(*)::int AS count FROM dispensing_records WHERE pharmacy_id=$1", [ctx(req).pharmacyId]);
  const rows = await pool.query<Record<string, unknown>>(
    `SELECT d.*, m.name AS medicine_name, u.name AS dispensed_by_name,
       COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id=d.medicine_id AND b.pharmacy_id=d.pharmacy_id AND b.quantity>0 AND b.expiry_date>=CURRENT_DATE),0) AS remaining_sellable_stock
     FROM dispensing_records d JOIN medicines m ON m.id=d.medicine_id JOIN users u ON u.id=d.dispensed_by
     WHERE d.pharmacy_id=$1 ORDER BY d.dispensed_at ${order}, d.id ${order} LIMIT $2 OFFSET $3`,
    [ctx(req).pharmacyId, limit, (page - 1) * limit],
  );
  res.json({ items: rows.rows.map(mapDispensing), pagination: pageInfo(page, limit, asNumber(count.rows[0].count)) });
});

router.post("/dispensing", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = DispenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { medicineId, quantity } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const medicine = await client.query<{ id: number; name: string }>("SELECT id, name FROM medicines WHERE id=$1 AND pharmacy_id=$2 FOR UPDATE", [medicineId, ctx(req).pharmacyId]);
    if (!medicine.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Medicine not found" });
      return;
    }
    const batches = await client.query<Record<string, unknown>>(
      `SELECT * FROM batches WHERE medicine_id=$1 AND pharmacy_id=$2 AND quantity>0 AND expiry_date>=CURRENT_DATE ORDER BY expiry_date ASC, created_at ASC, id ASC FOR UPDATE`,
      [medicineId, ctx(req).pharmacyId],
    );
    const available = batches.rows.reduce((sum, row) => sum + asNumber(row.quantity), 0);
    if (available < quantity) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Only ${available} sellable units are available. Expired stock is excluded.` });
      return;
    }
    let remaining = quantity;
    const allocations: Array<{ batchId: number; batchNumber: string; quantity: number; expiryDate: string }> = [];
    for (const row of batches.rows) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, asNumber(row.quantity));
      await client.query("UPDATE batches SET quantity=quantity-$1, updated_at=NOW() WHERE id=$2", [allocated, row.id]);
      allocations.push({ batchId: asNumber(row.id), batchNumber: String(row.batch_number), quantity: allocated, expiryDate: dateOnly(row.expiry_date) });
      remaining -= allocated;
    }
    const inserted = await client.query<{ id: number; dispensed_at: Date }>(
      `INSERT INTO dispensing_records (pharmacy_id, medicine_id, total_quantity, items, dispensed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, dispensed_at`,
      [ctx(req).pharmacyId, medicineId, quantity, JSON.stringify(allocations), ctx(req).userId],
    );
    const stock = await client.query<{ total: string }>("SELECT COALESCE(SUM(quantity),0) AS total FROM batches WHERE medicine_id=$1 AND pharmacy_id=$2 AND quantity>0 AND expiry_date>=CURRENT_DATE", [medicineId, ctx(req).pharmacyId]);
    await client.query("COMMIT");
    res.status(201).json({
      id: inserted.rows[0].id,
      medicineId,
      medicineName: medicine.rows[0].name,
      totalQuantity: quantity,
      items: allocations,
      dispensedBy: ctx(req).name,
      dispensedAt: new Date(inserted.rows[0].dispensed_at).toISOString(),
      remainingSellableStock: asNumber(stock.rows[0].total),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    req.log.error({ err: error }, "Dispensing transaction failed");
    res.status(500).json({ error: "Dispensing could not be completed" });
  } finally {
    client.release();
  }
});

router.get("/dispensing/:dispensingId", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = GetDispensingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await pool.query<Record<string, unknown>>(
    `SELECT d.*, m.name AS medicine_name, u.name AS dispensed_by_name,
      COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id=d.medicine_id AND b.pharmacy_id=d.pharmacy_id AND b.quantity>0 AND b.expiry_date>=CURRENT_DATE),0) AS remaining_sellable_stock
     FROM dispensing_records d JOIN medicines m ON m.id=d.medicine_id JOIN users u ON u.id=d.dispensed_by
     WHERE d.id=$1 AND d.pharmacy_id=$2`,
    [parseId(req.params.dispensingId), ctx(req).pharmacyId],
  );
  if (!row.rows[0]) {
    res.status(404).json({ error: "Dispensing record not found" });
    return;
  }
  res.json(mapDispensing(row.rows[0]));
});

async function alertPage(req: AuthedRequest, res: Response, expired: boolean): Promise<void> {
  const raw = expired ? ListExpiredAlertsQueryParams.safeParse(req.query) : ListExpiringAlertsQueryParams.safeParse(req.query);
  if (!raw.success) {
    res.status(400).json({ error: raw.error.message });
    return;
  }
  const data = raw.data;
  const page = data.page ?? 1;
  const limit = data.limit ?? 10;
  const days = "days" in data ? data.days ?? 30 : 30;
  const filter = expired ? "b.expiry_date < CURRENT_DATE" : "b.expiry_date >= CURRENT_DATE AND b.expiry_date <= CURRENT_DATE + ($2 || ' days')::interval";
  const params: unknown[] = expired ? [ctx(req).pharmacyId] : [ctx(req).pharmacyId, days];
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM batches b WHERE b.pharmacy_id=$1 AND b.quantity>0 AND ${filter}`, params);
  const rows = await pool.query<Record<string, unknown>>(
    `SELECT b.*, m.name AS medicine_name FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.pharmacy_id=$1 AND b.quantity>0 AND ${filter} ORDER BY b.expiry_date ASC, b.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  res.json({
    items: rows.rows.map((row) => {
      const expiryDate = dateOnly(row.expiry_date);
      return { id: asNumber(row.id), medicineId: asNumber(row.medicine_id), medicineName: String(row.medicine_name), batchNumber: String(row.batch_number), expiryDate, quantity: asNumber(row.quantity), daysRemaining: daysBetween(expiryDate), status: expired ? "expired" : "expiring_soon" };
    }),
    pagination: pageInfo(page, limit, asNumber(count.rows[0].count)),
  });
}

router.get("/alerts/expiring", requireAuth, (req: AuthedRequest, res: Response) => {
  void alertPage(req, res, false);
});
router.get("/alerts/expired", requireAuth, (req: AuthedRequest, res: Response) => {
  void alertPage(req, res, true);
});

export default router;