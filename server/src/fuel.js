import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const DEFAULT_API_URL = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
const CACHE_TTL_MS = 5 * 60 * 1_000;
const PAGE_SIZE = 100;
const MAX_RESULTS = 1_000;
const cache = new Map();

function parseDepartments(raw) {
  const departments = [...new Set(String(raw || "67,68").split(",").map(value => value.trim()).filter(Boolean))];
  if (!departments.length || departments.length > 10 || departments.some(value => !/^\d{2,3}$/.test(value))) {
    throw new Error("Départements invalides");
  }
  return departments;
}

async function fetchGovernmentData(departments) {
  const endpoint = process.env.FUEL_DATA_API_URL || DEFAULT_API_URL;
  const where = departments.map(department => `search(cp, "${department}*")`).join(" or ");
  const results = [];
  let totalCount = null;

  for (let offset = 0; offset < (totalCount ?? 1) && offset < MAX_RESULTS; offset += PAGE_SIZE) {
    const url = new URL(endpoint);
    url.searchParams.set("where", where);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Fuel data upstream returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.results)) throw new Error("Fuel data upstream returned an invalid payload");
    totalCount = Math.min(Number(payload.total_count || payload.results.length), MAX_RESULTS);
    results.push(...payload.results);
    if (payload.results.length < PAGE_SIZE) break;
  }

  return results;
}

async function attachBrands(records) {
  const ids = records.map(record => String(record.id)).filter(value => /^\d+$/.test(value));
  const brands = new Map();
  if (ids.length) {
    const result = await pool.query(
      "select station_id::text as station_id, brand from fuel_brands where station_id = any($1::bigint[])",
      [ids],
    );
    for (const row of result.rows) brands.set(row.station_id, row.brand);
  }

  return records.map(record => ({
    ...record,
    marque: brands.get(String(record.id)) || "",
    lat: Number(record.geom?.lat ?? Number(record.latitude) / 100_000),
    lon: Number(record.geom?.lon ?? Number(record.longitude) / 100_000),
  }));
}

async function fuelPayload(departments) {
  const key = departments.slice().sort().join(",");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.payload;

  const results = await attachBrands(await fetchGovernmentData(departments));
  const payload = { total_count: results.length, results };
  cache.set(key, { createdAt: Date.now(), payload });
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return payload;
}

export function registerFuelRoutes(app) {
  app.get("/api/fuel-prices", requireAuth, async (req, res, next) => {
    try {
      const departments = parseDepartments(req.query.deps);
      const payload = await fuelPayload(departments);
      res.set("Cache-Control", "private, max-age=300");
      return res.json(payload);
    } catch (error) {
      if (error.message === "Départements invalides") return res.status(400).json({ error: error.message });
      return next(error);
    }
  });
}
