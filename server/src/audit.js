import { pool } from "./db.js";

function safeDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const blocked = new Set(["pin", "password", "legacy_pin", "pin_hash", "token", "secret"]);
  return Object.fromEntries(Object.entries(details).filter(([key]) => !blocked.has(key.toLowerCase())));
}

export async function writeAdminAudit(auth, request, action, entityType, entityId = null, details = {}) {
  if (auth?.role !== "admin") return;
  const forwarded = request.get?.("x-forwarded-for");
  const ip = String(forwarded?.split(",")[0] || request.ip || "").trim() || null;
  await pool.query(
    `insert into admin_audit_log (technician_code, action, entity_type, entity_id, details, ip_address)
     values ($1, $2, $3, $4, $5::jsonb, $6::inet)`,
    [auth.code, action, entityType, entityId ? String(entityId) : null, JSON.stringify(safeDetails(details)), ip],
  );
}

export async function tryAdminAudit(...args) {
  try {
    await writeAdminAudit(...args);
  } catch (error) {
    console.error("Unable to write admin audit log", error);
  }
}

export { safeDetails };
