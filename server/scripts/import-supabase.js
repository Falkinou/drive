import fs from "node:fs/promises";
import path from "node:path";
import format from "pg-format";
import { pool, transaction, waitForDatabase } from "../src/db.js";

const migrationDir = path.resolve(process.argv[2] || "/migration");
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "/data/uploads");

const TABLE_ORDER = [
  "technicians",
  "sites",
  "anfr_data",
  "directory",
  "notebooks",
  "note_sections",
  "notes_content",
  "note_comments",
  "notes",
  "photos",
  "activity_log",
  "visits",
  "login_logs",
  "ratings",
  "announcements",
  "trash",
  "game_sessions",
  "game_players",
  "td_sessions",
  "td_players",
  "bacteria_sessions",
];

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function databaseColumns(client, table) {
  const result = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return new Set(result.rows.map(row => row.column_name));
}

async function upsertRows(client, table, sourceRows, photoFiles, avatarFiles) {
  if (!sourceRows.length) return 0;
  const columns = await databaseColumns(client, table);
  let imported = 0;

  for (const source of sourceRows) {
    const row = { ...source };
    const legacyPin = table === "technicians" ? row.pin : null;
    delete row.pin;

    if (table === "photos" && photoFiles[row.id]) {
      row.url = `/api/uploads/site-photos/${photoFiles[row.id].fileName}`;
    }
    if (table === "technicians" && avatarFiles[row.id]) {
      row.avatar_url = `/api/uploads/avatars/${avatarFiles[row.id].fileName}`;
    }

    const entries = Object.entries(row).filter(([column]) => columns.has(column));
    if (!entries.length || !row.id) continue;
    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const updates = keys.filter(key => key !== "id");
    const conflict = updates.length
      ? `do update set ${updates.map(key => `${format("%I", key)} = excluded.${format("%I", key)}`).join(",")}`
      : "do nothing";
    const sql = `insert into ${format("%I", table)} (${keys.map(key => format("%I", key)).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")}) on conflict (id) ${conflict}`;
    await client.query(sql, values);

    if (table === "technicians" && legacyPin) {
      await client.query(
        `insert into technician_credentials (technician_id, legacy_pin)
         values ($1, $2)
         on conflict (technician_id) do update
           set legacy_pin = excluded.legacy_pin, updated_at = now()`,
        [row.id, legacyPin],
      );
    }
    imported += 1;
  }
  return imported;
}

async function resetIdentity(client, table) {
  const sequence = await client.query("select pg_get_serial_sequence($1, 'id') as name", [`public.${table}`]);
  if (!sequence.rows[0]?.name) return;
  await client.query(
    `select setval($1, greatest(coalesce((select max(id) from ${format("%I", table)}), 1), 1), true)`,
    [sequence.rows[0].name],
  );
}

async function copyAssets(directory, files) {
  const target = path.join(uploadDir, directory);
  await fs.mkdir(target, { recursive: true });
  await fs.chown(target, Number(process.env.RUNTIME_UID || 1000), Number(process.env.RUNTIME_GID || 1000));
  for (const { fileName } of Object.values(files)) {
    const destination = path.join(target, fileName);
    await fs.copyFile(path.join(migrationDir, "storage", directory, fileName), destination);
    await fs.chmod(destination, 0o640);
    await fs.chown(destination, Number(process.env.RUNTIME_UID || 1000), Number(process.env.RUNTIME_GID || 1000));
  }
}

await waitForDatabase();
const photoFiles = await readJson(path.join(migrationDir, "photo-files.json"), {});
const avatarFiles = await readJson(path.join(migrationDir, "avatar-files.json"), {});

await transaction(async client => {
  for (const table of TABLE_ORDER) {
    const rows = await readJson(path.join(migrationDir, "tables", `${table}.json`), []);
    const imported = await upsertRows(client, table, rows, photoFiles, avatarFiles);
    await resetIdentity(client, table);
    console.log(`${table}: ${imported} rows imported`);
  }

  const photos = await readJson(path.join(migrationDir, "tables", "photos.json"), []);
  for (const photo of photos) {
    const file = photoFiles[photo.id];
    if (!file) continue;
    const sourcePath = path.join(migrationDir, "storage", "site-photos", file.fileName);
    const stat = await fs.stat(sourcePath);
    await client.query(
      `insert into upload_records (file_name, site_id, uploader_code, original_name, mime_type, size_bytes)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (file_name) do nothing`,
      [file.fileName, photo.site_id, photo.technician_code, photo.filename || file.fileName, file.contentType, stat.size],
    );
  }
});

await copyAssets("site-photos", photoFiles);
await copyAssets("avatars", avatarFiles);
console.log(`Migration complete: ${Object.keys(photoFiles).length} photos and ${Object.keys(avatarFiles).length} avatars copied`);
await pool.end();
