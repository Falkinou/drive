import fs from "node:fs/promises";
import path from "node:path";
import { pool, transaction, waitForDatabase } from "../src/db.js";

const source = path.resolve(process.argv[2] || "/migration/fuel-brands.json");
const rows = JSON.parse(await fs.readFile(source, "utf8"));
if (!Array.isArray(rows)) throw new Error("Fuel brand export must be an array");

await waitForDatabase();
const imported = await transaction(async client => {
  let count = 0;
  for (const row of rows) {
    const stationId = String(row?.station_id || "");
    const brand = String(row?.brand || "").trim().slice(0, 200);
    if (!/^\d+$/.test(stationId) || !brand) continue;
    await client.query(
      `insert into fuel_brands (station_id, brand) values ($1, $2)
       on conflict (station_id) do update set brand = excluded.brand, updated_at = now()`,
      [stationId, brand],
    );
    count += 1;
  }
  return count;
});

console.log(`fuel_brands: ${imported} rows imported`);
await pool.end();
