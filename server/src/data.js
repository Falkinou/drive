import format from "pg-format";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const TABLE_ACCESS = {
  sites: { read: "tech", write: "tech" },
  technicians: { read: "tech", write: "admin" },
  notes: { read: "tech", write: "tech" },
  photos: { read: "tech", write: "tech" },
  activity_log: { read: "tech", write: "tech" },
  visits: { read: "tech", write: "tech" },
  login_logs: { read: "admin", write: null },
  ratings: { read: "tech", write: "tech" },
  anfr_data: { read: "tech", write: "admin" },
  directory: { read: "tech", write: "tech" },
  notebooks: { read: "tech", write: "tech" },
  note_sections: { read: "tech", write: "tech" },
  notes_content: { read: "tech", write: "tech" },
  note_comments: { read: "tech", write: "tech" },
  announcements: { read: "tech", write: "admin" },
  trash: { read: "admin", write: "tech", delete: "admin" },
  game_sessions: { read: "tech", write: "tech" },
  game_players: { read: "tech", write: "tech" },
  td_sessions: { read: "tech", write: "tech" },
  td_players: { read: "tech", write: "tech" },
  bacteria_sessions: { read: "tech", write: null },
};

const ACTOR_COLUMNS = {
  notes: ["technician_code"],
  photos: ["technician_code"],
  activity_log: ["technician_code"],
  visits: ["technician_code"],
  ratings: ["technician_code"],
  directory: ["author_code", "author_name"],
  notebooks: ["author_code", "author_name"],
  notes_content: ["author_code", "author_name"],
  note_comments: ["author_code", "author_name"],
  announcements: ["author_code", "author_name"],
  game_sessions: ["host_code"],
  game_players: ["player_code"],
  td_sessions: ["host_code"],
  td_players: ["player_code"],
  bacteria_sessions: ["host_code", "host_name"],
};

const RESERVED_QUERY = new Set(["select", "order", "limit", "offset"]);
const columnCache = new Map();

function hasRole(actual, required) {
  if (!required) return false;
  return actual === "admin" || required === "tech";
}
async function getColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const result = await pool.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  const columns = new Set(result.rows.map(row => row.column_name));
  columnCache.set(table, columns);
  return columns;
}

function parseFilter(raw) {
  const dot = raw.indexOf(".");
  if (dot < 1) throw new Error("Filtre invalide");
  return { operator: raw.slice(0, dot), value: raw.slice(dot + 1) };
}

function buildWhere(searchParams, columns, values, alias = null) {
  const clauses = [];
  for (const [column, raw] of searchParams.entries()) {
    if (RESERVED_QUERY.has(column)) continue;
    if (!columns.has(column)) throw new Error(`Colonne inconnue: ${column}`);
    const { operator, value } = parseFilter(raw);
    const identifier = alias ? format("%I.%I", alias, column) : format("%I", column);

    if (operator === "is" && value === "null") {
      clauses.push(`${identifier} is null`);
      continue;
    }
    if (operator === "is" && value === "not.null") {
      clauses.push(`${identifier} is not null`);
      continue;
    }
    if (operator === "in") {
      if (!value.startsWith("(") || !value.endsWith(")")) throw new Error("Filtre IN invalide");
      const items = value.slice(1, -1).split(",").map(item => item.trim()).filter(Boolean);
      if (items.length === 0 || items.length > 1_000) throw new Error("Filtre IN invalide");
      const placeholders = items.map(item => {
        values.push(item);
        return `$${values.length}`;
      });
      clauses.push(`${identifier} in (${placeholders.join(",")})`);
      continue;
    }

    const sqlOperator = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[operator];
    if (!sqlOperator) throw new Error(`Opérateur non autorisé: ${operator}`);
    values.push(value);
    clauses.push(`${identifier} ${sqlOperator} $${values.length}`);
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function selectClause(raw, columns, table) {
  const requested = !raw || raw === "*" ? [...columns] : raw.split(",").map(value => value.trim());
  for (const column of requested) {
    if (!columns.has(column)) throw new Error(`Colonne inconnue: ${column}`);
  }
  const fields = requested.map(column => format("%I", column));
  if (table === "technicians" && (!raw || raw === "*")) {
    fields.push("exists(select 1 from technician_credentials c where c.technician_id = technicians.id and (c.pin_hash is not null or c.legacy_pin is not null)) as has_pin");
  }
  return fields.join(", ");
}

function orderClause(raw, columns) {
  if (!raw) return "";
  const parts = raw.split(",").map(part => {
    const [column, direction = "asc"] = part.trim().split(".");
    if (!columns.has(column) || !["asc", "desc"].includes(direction.toLowerCase())) throw new Error("Tri invalide");
    return `${format("%I", column)} ${direction.toUpperCase()}`;
  });
  return ` order by ${parts.join(", ")}`;
}

function paginationClause(searchParams, values) {
  const requestedLimit = Number(searchParams.get("limit") || 1_000);
  const requestedOffset = Number(searchParams.get("offset") || 0);
  const limit = Math.max(1, Math.min(10_000, Number.isFinite(requestedLimit) ? requestedLimit : 1_000));
  const offset = Math.max(0, Number.isFinite(requestedOffset) ? requestedOffset : 0);
  values.push(limit, offset);
  return ` limit $${values.length - 1} offset $${values.length}`;
}

function enforceActor(table, data, auth) {
  const result = { ...data };
  for (const column of ACTOR_COLUMNS[table] || []) {
    if (column.endsWith("_name")) result[column] = auth.name || auth.code;
    else result[column] = auth.code;
  }
  return result;
}

function validatePayload(payload, columns) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Objet JSON requis");
  const entries = Object.entries(payload).filter(([column]) => columns.has(column) && !["id", "created_at", "updated_at"].includes(column));
  if (entries.length === 0) throw new Error("Aucune donnée valide");
  return Object.fromEntries(entries);
}

function reject(error, res, next) {
  if (/invalide|inconnue|autorisé|Objet JSON|Aucune donnée|Filtre|Tri/.test(error.message)) {
    return res.status(400).json({ error: error.message });
  }
  return next(error);
}

export function registerDataRoutes(app) {
  app.use("/api/data", requireAuth);

  app.get("/api/data/:table", async (req, res, next) => {
    try {
      const access = TABLE_ACCESS[req.params.table];
      if (!access || !hasRole(req.auth.role, access.read)) return res.status(403).json({ error: "Accès refusé" });
      const columns = await getColumns(req.params.table);
      const values = [];
      const selection = selectClause(req.query.select, columns, req.params.table);
      const where = buildWhere(new URLSearchParams(req.originalUrl.split("?")[1] || ""), columns, values);
      const order = orderClause(req.query.order, columns);
      const pagination = paginationClause(new URLSearchParams(req.originalUrl.split("?")[1] || ""), values);
      const sql = `select ${selection} from ${format("%I", req.params.table)}${where}${order}${pagination}`;
      const result = await pool.query(sql, values);
      return res.json(result.rows);
    } catch (error) {
      return reject(error, res, next);
    }
  });

  app.post("/api/data/:table", async (req, res, next) => {
    try {
      const access = TABLE_ACCESS[req.params.table];
      if (!access || !hasRole(req.auth.role, access.write)) return res.status(403).json({ error: "Accès refusé" });
      const columns = await getColumns(req.params.table);
      const payload = validatePayload(enforceActor(req.params.table, req.body, req.auth), columns);
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const sql = `insert into ${format("%I", req.params.table)} (${keys.map(key => format("%I", key)).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")}) returning *`;
      const result = await pool.query(sql, values);
      return res.status(201).json(result.rows);
    } catch (error) {
      return reject(error, res, next);
    }
  });

  app.patch("/api/data/:table", async (req, res, next) => {
    try {
      const access = TABLE_ACCESS[req.params.table];
      const table = req.params.table;
      const columns = await getColumns(table);
      let allowed = access && hasRole(req.auth.role, access.write);
      let rawPayload = { ...req.body };

      if (table === "technicians" && req.auth.role !== "admin") {
        const params = new URLSearchParams(req.originalUrl.split("?")[1] || "");
        allowed = params.get("code") === `eq.${req.auth.code}`;
        rawPayload = Object.fromEntries(Object.entries(rawPayload).filter(([key]) => key === "avatar_url"));
      }
      if (!allowed) return res.status(403).json({ error: "Accès refusé" });

      for (const actorColumn of ACTOR_COLUMNS[table] || []) {
        if (req.auth.role !== "admin") delete rawPayload[actorColumn];
      }
      const payload = validatePayload(rawPayload, columns);
      const values = Object.values(payload);
      const assignments = Object.keys(payload).map((column, index) => `${format("%I", column)} = $${index + 1}`);
      const params = new URLSearchParams(req.originalUrl.split("?")[1] || "");
      const where = buildWhere(params, columns, values);
      if (!where) return res.status(400).json({ error: "Un filtre est requis" });
      const sql = `update ${format("%I", table)} set ${assignments.join(", ")}${where} returning *`;
      const result = await pool.query(sql, values);
      return res.json(result.rows);
    } catch (error) {
      return reject(error, res, next);
    }
  });

  app.delete("/api/data/:table", async (req, res, next) => {
    try {
      const access = TABLE_ACCESS[req.params.table];
      const required = access?.delete || access?.write;
      if (!access || !hasRole(req.auth.role, required)) return res.status(403).json({ error: "Accès refusé" });
      const columns = await getColumns(req.params.table);
      const values = [];
      const params = new URLSearchParams(req.originalUrl.split("?")[1] || "");
      const where = buildWhere(params, columns, values);
      if (!where) return res.status(400).json({ error: "Un filtre est requis" });
      await pool.query(`delete from ${format("%I", req.params.table)}${where}`, values);
      return res.status(204).end();
    } catch (error) {
      return reject(error, res, next);
    }
  });
}
