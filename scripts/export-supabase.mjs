import fs from "node:fs/promises";
import path from "node:path";

const TABLES = [
  "technicians",
  "sites",
  "notes",
  "photos",
  "activity_log",
  "visits",
  "login_logs",
  "ratings",
  "anfr_data",
  "directory",
  "notebooks",
  "note_sections",
  "notes_content",
  "note_comments",
  "announcements",
  "trash",
  "game_sessions",
  "game_players",
  "td_sessions",
  "td_players",
  "bacteria_sessions",
];

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const outputDir = path.resolve(process.argv[2] || "migration-data");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  Accept: "application/json",
};

async function exportTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1_000) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < 1_000) break;
  }
  const file = path.join(outputDir, "tables", `${table}.json`);
  await fs.writeFile(file, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  console.log(`${table}: ${rows.length} rows`);
  return rows;
}

async function exportPhotos(rows) {
  const photoDir = path.join(outputDir, "storage", "site-photos");
  await fs.mkdir(photoDir, { recursive: true, mode: 0o700 });
  const mapping = {};
  for (const photo of rows || []) {
    if (!photo?.id || !photo?.url) continue;
    const response = await fetch(photo.url);
    if (!response.ok) {
      console.warn(`photo ${photo.id}: HTTP ${response.status}`);
      continue;
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const fileName = `${photo.id}${extension}`;
    await fs.writeFile(path.join(photoDir, fileName), Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    mapping[photo.id] = { fileName, contentType };
  }
  await fs.writeFile(path.join(outputDir, "photo-files.json"), `${JSON.stringify(mapping, null, 2)}\n`, { mode: 0o600 });
  console.log(`site-photos: ${Object.keys(mapping).length} files`);
}

async function exportAvatars(rows) {
  const avatarDir = path.join(outputDir, "storage", "avatars");
  await fs.mkdir(avatarDir, { recursive: true, mode: 0o700 });
  const mapping = {};
  for (const tech of rows || []) {
    if (!tech?.id || !tech?.avatar_url) continue;
    const response = await fetch(tech.avatar_url);
    if (!response.ok) {
      console.warn(`avatar ${tech.id}: HTTP ${response.status}`);
      continue;
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const fileName = `${tech.id}${extension}`;
    await fs.writeFile(path.join(avatarDir, fileName), Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    mapping[tech.id] = { fileName, contentType };
  }
  await fs.writeFile(path.join(outputDir, "avatar-files.json"), `${JSON.stringify(mapping, null, 2)}\n`, { mode: 0o600 });
  console.log(`avatars: ${Object.keys(mapping).length} files`);
}

await fs.mkdir(path.join(outputDir, "tables"), { recursive: true, mode: 0o700 });
await fs.chmod(outputDir, 0o700);

const exported = {};
for (const table of TABLES) exported[table] = await exportTable(table);
await exportPhotos(exported.photos);
await exportAvatars(exported.technicians);

const manifest = {
  exportedAt: new Date().toISOString(),
  source: new URL(supabaseUrl).host,
  counts: Object.fromEntries(TABLES.map(table => [table, exported[table]?.length ?? null])),
};
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`Export complete: ${outputDir}`);
