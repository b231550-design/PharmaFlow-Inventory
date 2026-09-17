import { randomBytes, scryptSync } from "node:crypto";
import { pool } from "@workspace/db";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const pharmacy = await client.query<{ id: number }>(
    `INSERT INTO pharmacies (name, address, phone, alert_threshold_days)
     VALUES ('Harbor Health Pharmacy', '14 Market Lane, Pune', '+91 20 5550 0142', 30)
     ON CONFLICT DO NOTHING
     RETURNING id`,
  );
  const pharmacyId =
    pharmacy.rows[0]?.id ??
    (
      await client.query<{ id: number }>(
        "SELECT id FROM pharmacies WHERE name='Harbor Health Pharmacy' ORDER BY id LIMIT 1",
      )
    ).rows[0].id;

  await client.query(
    `INSERT INTO users (name, email, password_hash, role, pharmacy_id)
     VALUES ('Asha Mehta', 'demo@pharmaflow.app', $1, 'owner', $2)
     ON CONFLICT (email) DO UPDATE SET pharmacy_id=EXCLUDED.pharmacy_id, password_hash=EXCLUDED.password_hash`,
    [hashPassword("PharmaFlow123!"), pharmacyId],
  );

  const medicines = [
    ["Paracetamol 500mg", "Paracetamol", "Pain relief", "Cipla", "tablets", 100, "Everyday fever and pain relief."],
    ["Amoxicillin 250mg", "Amoxicillin", "Antibiotic", "Sun Pharma", "capsules", 40, "Prescription antibiotic."],
    ["Cetirizine 10mg", "Cetirizine", "Allergy", "Dr. Reddy's", "tablets", 60, "Non-drowsy allergy relief."],
    ["ORS Orange", "Oral rehydration salts", "Hydration", "Electral", "sachets", 30, "Oral rehydration powder."],
  ] as const;

  for (const medicine of medicines) {
    const row = await client.query<{ id: number }>(
      `INSERT INTO medicines (pharmacy_id, name, generic_name, category, manufacturer, unit, reorder_level, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING RETURNING id`,
      [pharmacyId, ...medicine],
    );
    const medicineId =
      row.rows[0]?.id ??
      (
        await client.query<{ id: number }>(
          "SELECT id FROM medicines WHERE pharmacy_id=$1 AND name=$2 LIMIT 1",
          [pharmacyId, medicine[0]],
        )
      ).rows[0].id;

    if (medicine[0] === "Paracetamol 500mg") {
      await client.query(
        `INSERT INTO batches (pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES ($1,$2,'PCM-2409','2026-09-25',50,1.2,2.5),($1,$2,'PCM-2412','2026-12-15',100,1.3,2.7),($1,$2,'PCM-2502','2027-03-10',75,1.4,2.9),($1,$2,'PCM-2301','2026-08-01',40,1.0,2.2)
         ON CONFLICT DO NOTHING`,
        [pharmacyId, medicineId],
      );
    } else if (medicine[0] === "Amoxicillin 250mg") {
      await client.query(
        `INSERT INTO batches (pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES ($1,$2,'AMX-2504','2026-10-18',18,3.5,6.5),($1,$2,'AMX-2408','2026-07-20',12,3.2,6.0)
         ON CONFLICT DO NOTHING`,
        [pharmacyId, medicineId],
      );
    } else if (medicine[0] === "Cetirizine 10mg") {
      await client.query(
        `INSERT INTO batches (pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES ($1,$2,'CTZ-2511','2027-01-31',24,0.9,2.0)
         ON CONFLICT DO NOTHING`,
        [pharmacyId, medicineId],
      );
    } else {
      await client.query(
        `INSERT INTO batches (pharmacy_id, medicine_id, batch_number, expiry_date, quantity, purchase_price, selling_price)
         VALUES ($1,$2,'ORS-2501','2026-11-05',8,8,15)
         ON CONFLICT DO NOTHING`,
        [pharmacyId, medicineId],
      );
    }
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}