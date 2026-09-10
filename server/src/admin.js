import format from "pg-format";
import { pool, transaction } from "./db.js";
import { requireAdmin, requireAuth } from "./auth.js";

const RESTORE_TABLES = new Set(["sites", "technicians", "notes", "photos", "activity_log", "visits", "login_logs", "ratings"]);

export function registerAdminRoutes(app) {
  app.post("/api/admin/restore", requireAuth, requireAdmin, async (req, res, next) => {
    const table = String(req.body?.table || "");
    const rows = req.body?.rows;
    if (!RESTORE_TABLES.has(table) || !Array.isArray(rows) || rows.length > 200) {
      return res.status(400).json({ error: "Lot de restauration invalide" });
    }

    try {
      const imported = await transaction(async client => {
        const schema = await client.query(
          `select column_name from information_schema.columns
            where table_schema = 'public' and table_name = $1`,
          [table],
        );
        const columns = new Set(schema.rows.map(row => row.column_name));
        let count = 0;

        for (const source of rows) {
          if (!source || typeof source !== "object" || Array.isArray(source)) continue;
          const row = { ...source };
          const legacyPin = table === "technicians" ? row.pin : null;
          delete row.pin;
          const entries = Object.entries(row).filter(([column]) => columns.has(column));
          if (!entries.length || !row.id) continue;
          const keys = entries.map(([key]) => key);
          const values = entries.map(([, value]) => value);
          const updates = keys.filter(key => key !== "id");
          const conflict = updates.length
            ? `do update set ${updates.map(key => `${format("%I", key)} = excluded.${format("%I", key)}`).join(",")}`
            : "do nothing";
          await client.query(
            `insert into ${format("%I", table)} (${keys.map(key => format("%I", key)).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")}) on conflict (id) ${conflict}`,
            values,
          );
          if (table === "technicians" && legacyPin) {
            await client.query(
              `insert into technician_credentials (technician_id, legacy_pin) values ($1, $2)
               on conflict (technician_id) do update set legacy_pin = excluded.legacy_pin, updated_at = now()`,
              [row.id, legacyPin],
            );
          }
          count += 1;
        }
        return count;
      });
      return res.json({ imported });
    } catch (error) {
      return next(error);
    }
  });
}
