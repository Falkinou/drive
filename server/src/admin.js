import { readdir, stat, statfs } from "node:fs/promises";
import os from "node:os";
import format from "pg-format";
import { pool, transaction } from "./db.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { tryAdminAudit } from "./audit.js";

const RESTORE_TABLES = new Set(["sites", "technicians", "notes", "photos", "activity_log", "visits", "login_logs", "ratings"]);
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/data/uploads";
const BACKUP_DIR = process.env.BACKUP_DIR || "/data/backups";

const number = value => Number(value || 0);

function periodBounds(search = {}) {
  const now = new Date();
  const end = search.to ? new Date(search.to) : now;
  let start;
  if (search.from) start = new Date(search.from);
  else if (search.period === "week") start = new Date(end.getTime() - 7 * 86_400_000);
  else if (search.period === "quarter") { start = new Date(end); start.setMonth(start.getMonth() - 3); }
  else if (search.period === "year") { start = new Date(end); start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  else { start = new Date(end); start.setDate(1); start.setHours(0, 0, 0, 0); }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new Error("Période invalide");
  const duration = end.getTime() - start.getTime();
  if (duration > 370 * 86_400_000) throw new Error("Période trop longue");
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

async function directoryInfo(path, matcher = () => true) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !matcher(entry.name)) continue;
      const info = await stat(`${path}/${entry.name}`);
      files.push({ name: entry.name, size: info.size, createdAt: info.mtime.toISOString() });
    }
    files.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    return { count: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), latest: files[0] || null };
  } catch {
    return { count: 0, bytes: 0, latest: null, unavailable: true };
  }
}

async function directoryBytes(path) {
  try {
    let bytes = 0;
    let visited = 0;
    const pending = [path];
    while (pending.length && visited < 100_000) {
      const current = pending.pop();
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        visited += 1;
        const target = `${current}/${entry.name}`;
        if (entry.isDirectory()) pending.push(target);
        else if (entry.isFile()) bytes += (await stat(target)).size;
      }
    }
    return bytes;
  } catch {
    return 0;
  }
}

async function dashboardData() {
  const [summaryResult, visitsResult, activityResult] = await Promise.all([
    pool.query(`
      select
        (select count(*)::int from sites where deleted_at is null) as sites,
        (select count(*)::int from sites where deleted_at is null and lat is not null and lng is not null and not (lat = 0 and lng = 0)) as gps,
        (select count(*)::int from sites where deleted_at is null and type = 'mobile') as mobile,
        (select count(*)::int from sites where deleted_at is null and type = 'mobile' and anfr_support_id is not null) as anfr,
        (select count(*)::int from technicians) as accounts_total,
        (select count(*)::int from technicians where active is not false) as accounts_active,
        (select count(*)::int from visits where visited_at >= date_trunc('month', now())) as visits_month,
        (select count(*)::int from visits where visited_at >= date_trunc('month', now()) - interval '1 month' and visited_at < date_trunc('month', now())) as visits_previous_month,
        (select count(*)::int from activity_log where created_at >= now() - interval '30 days') as actions_30d,
        (select count(*)::int from activity_log where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') as actions_previous_30d,
        (select count(*)::int from login_logs where success is false and created_at >= now() - interval '24 hours') as failed_logins_24h,
        (select count(*)::int from sites s where s.deleted_at is null and s.type = 'mobile' and not exists (
          select 1 from visits v where v.site_id = s.id and v.visited_at >= now() - interval '30 days'
        )) as stale_mobile_30d
    `),
    pool.query(`
      select series.day::date as day, count(v.id)::int as count
      from generate_series(current_date - interval '6 days', current_date, interval '1 day') series(day)
      left join visits v on v.visited_at >= series.day and v.visited_at < series.day + interval '1 day'
      group by series.day order by series.day
    `),
    pool.query(`
      select a.id, a.action, a.created_at, a.technician_code, a.site_id,
             coalesce(t.name, a.technician_code::text) as technician_name,
             coalesce(s.name, 'Site inconnu') as site_name
      from activity_log a
      left join technicians t on t.code = a.technician_code
      left join sites s on s.id = a.site_id
      order by a.created_at desc limit 8
    `),
  ]);
  const totals = Object.fromEntries(Object.entries(summaryResult.rows[0]).map(([key, value]) => [key, number(value)]));
  return {
    generatedAt: new Date().toISOString(),
    totals,
    percentages: {
      gps: totals.sites ? Math.round(totals.gps / totals.sites * 100) : 0,
      anfr: totals.mobile ? Math.round(totals.anfr / totals.mobile * 100) : 0,
    },
    visits7d: visitsResult.rows,
    recentActivity: activityResult.rows,
  };
}

async function teamData(search) {
  const { start, end, previousStart, previousEnd } = periodBounds(search);
  const result = await pool.query(`
    with current_visits as (
      select technician_code, count(*)::int visits, count(distinct site_id)::int unique_sites,
             count(distinct visited_at::date)::int active_days, max(visited_at) last_visit
      from visits where visited_at >= $1 and visited_at < $2 group by technician_code
    ), current_actions as (
      select technician_code, count(*)::int actions,
             count(*) filter (where action = 'edit')::int edits,
             count(*) filter (where action = 'photo')::int photos,
             count(*) filter (where action = 'comment')::int notes,
             max(created_at) last_action
      from activity_log where created_at >= $1 and created_at < $2 group by technician_code
    ), previous_activity as (
      select code, sum(visits)::int visits, sum(actions)::int actions from (
        select technician_code as code, count(*) visits, 0 actions from visits
          where visited_at >= $3 and visited_at < $4 group by technician_code
        union all
        select technician_code as code, 0 visits, count(*) actions from activity_log
          where created_at >= $3 and created_at < $4 group by technician_code
      ) p group by code
    )
    select t.id, t.code, t.name, t.active,
           coalesce(v.visits, 0)::int visits, coalesce(v.unique_sites, 0)::int unique_sites,
           coalesce(v.active_days, 0)::int active_days, coalesce(a.actions, 0)::int actions,
           coalesce(a.edits, 0)::int edits, coalesce(a.photos, 0)::int photos, coalesce(a.notes, 0)::int notes,
           greatest(v.last_visit, a.last_action) last_activity,
           coalesce(p.visits, 0)::int previous_visits, coalesce(p.actions, 0)::int previous_actions
    from technicians t
    left join current_visits v on v.technician_code = t.code
    left join current_actions a on a.technician_code = t.code
    left join previous_activity p on p.code = t.code
    order by (coalesce(v.visits, 0) + coalesce(a.actions, 0)) desc, t.name asc
  `, [start, end, previousStart, previousEnd]);
  return { from: start.toISOString(), to: end.toISOString(), previousFrom: previousStart.toISOString(), previousTo: previousEnd.toISOString(), technicians: result.rows };
}

async function systemData() {
  const started = performance.now();
  const [databaseResult, backups, uploadBytes, disk] = await Promise.all([
    pool.query(`select pg_database_size(current_database())::bigint size_bytes,
      (select count(*)::int from pg_stat_activity where datname = current_database()) connections,
      current_setting('server_version') version`),
    directoryInfo(BACKUP_DIR, name => /^drive-.*\.(dump|tar\.gz)$/.test(name)),
    directoryBytes(UPLOAD_DIR),
    statfs(UPLOAD_DIR).catch(() => null),
  ]);
  const db = databaseResult.rows[0];
  const total = disk ? disk.blocks * disk.bsize : 0;
  const free = disk ? disk.bavail * disk.bsize : 0;
  const latestAgeHours = backups.latest ? (Date.now() - new Date(backups.latest.createdAt).getTime()) / 3_600_000 : null;
  return {
    generatedAt: new Date().toISOString(),
    api: { uptimeSeconds: Math.round(process.uptime()), responseMs: Math.round(performance.now() - started), node: process.version },
    database: { sizeBytes: number(db.size_bytes), connections: number(db.connections), version: db.version },
    storage: { totalBytes: total, freeBytes: free, usedBytes: Math.max(0, total - free), usedPercent: total ? Math.round((total - free) / total * 100) : null, uploadBytes },
    backup: { ...backups, latestAgeHours, healthy: latestAgeHours !== null && latestAgeHours < 30 },
    host: { hostname: os.hostname(), load: os.loadavg().map(value => Number(value.toFixed(2))), memoryTotalBytes: os.totalmem(), memoryFreeBytes: os.freemem() },
  };
}

export function registerAdminRoutes(app) {
  app.get("/api/admin/dashboard", requireAuth, requireAdmin, async (_req, res, next) => {
    try { return res.json(await dashboardData()); } catch (error) { return next(error); }
  });
  app.get("/api/admin/team", requireAuth, requireAdmin, async (req, res, next) => {
    try { return res.json(await teamData(req.query)); } catch (error) {
      if (/Période/.test(error.message)) return res.status(400).json({ error: error.message });
      return next(error);
    }
  });
  app.get("/api/admin/system", requireAuth, requireAdmin, async (_req, res, next) => {
    try { return res.json(await systemData()); } catch (error) { return next(error); }
  });
  app.get("/api/admin/audit", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const requested = Number(req.query.limit || 100);
      const limit = Math.max(1, Math.min(500, Number.isFinite(requested) ? requested : 100));
      const result = await pool.query(`select a.id, a.technician_code,
        coalesce(t.name, a.technician_code::text) technician_name, a.action, a.entity_type,
        a.entity_id, a.details, a.created_at from admin_audit_log a
        left join technicians t on t.code = a.technician_code order by a.created_at desc limit $1`, [limit]);
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });

  app.post("/api/admin/restore", requireAuth, requireAdmin, async (req, res, next) => {
    const table = String(req.body?.table || "");
    const rows = req.body?.rows;
    if (!RESTORE_TABLES.has(table) || !Array.isArray(rows) || rows.length > 200) return res.status(400).json({ error: "Lot de restauration invalide" });
    try {
      const imported = await transaction(async client => {
        const schema = await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]);
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
          const conflict = updates.length ? `do update set ${updates.map(key => `${format("%I", key)} = excluded.${format("%I", key)}`).join(",")}` : "do nothing";
          await client.query(`insert into ${format("%I", table)} (${keys.map(key => format("%I", key)).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")}) on conflict (id) ${conflict}`, values);
          if (table === "technicians" && legacyPin) await client.query(`insert into technician_credentials (technician_id, legacy_pin) values ($1, $2) on conflict (technician_id) do update set legacy_pin = excluded.legacy_pin, updated_at = now()`, [row.id, legacyPin]);
          count += 1;
        }
        return count;
      });
      await tryAdminAudit(req.auth, req, "restore", table, null, { imported });
      return res.json({ imported });
    } catch (error) { return next(error); }
  });
}

export { dashboardData, directoryBytes, directoryInfo, number, periodBounds, systemData, teamData };
