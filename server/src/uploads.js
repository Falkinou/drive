import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "/data/uploads");
const photoRoot = path.join(uploadRoot, "site-photos");
const avatarRoot = path.join(uploadRoot, "avatars");
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 12)) * 1024 * 1024;
const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

await fs.mkdir(photoRoot, { recursive: true });
await fs.mkdir(avatarRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, photoRoot),
  filename: (_req, file, callback) => {
    const extension = extensions.get(file.mimetype);
    callback(extension ? null : new Error("Format d'image non autorisé"), `${crypto.randomUUID()}${extension || ""}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, extensions.has(file.mimetype)),
});

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, avatarRoot),
  filename: (_req, file, callback) => {
    const extension = extensions.get(file.mimetype);
    callback(extension ? null : new Error("Format d'image non autorisé"), `${crypto.randomUUID()}${extension || ""}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, extensions.has(file.mimetype)),
});

const safeFileName = value => /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(value || "");

export function registerUploadRoutes(app) {
  app.post("/api/uploads/avatar", requireAuth, avatarUpload.single("photo"), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "Photo requise" });
    const url = `/api/uploads/avatars/${req.file.filename}`;
    try {
      await pool.query("update technicians set avatar_url = $1 where id = $2", [url, req.auth.id]);
      return res.status(201).json({ url });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      return next(error);
    }
  });

  app.get("/api/uploads/avatars/:fileName", requireAuth, (req, res) => {
    if (!safeFileName(req.params.fileName)) return res.status(404).end();
    return res.sendFile(req.params.fileName, { root: avatarRoot, dotfiles: "deny" });
  });

  app.post("/api/uploads/site-photos/:siteId", requireAuth, upload.single("photo"), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "Photo requise" });
    try {
      await pool.query(
        `insert into upload_records (file_name, site_id, uploader_code, original_name, mime_type, size_bytes)
         values ($1, $2, $3, $4, $5, $6)`,
        [req.file.filename, req.params.siteId, req.auth.code, req.file.originalname.slice(0, 255), req.file.mimetype, req.file.size],
      );
      return res.status(201).json({ url: `/api/uploads/site-photos/${req.file.filename}` });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      return next(error);
    }
  });

  app.get("/api/uploads/site-photos/:fileName", requireAuth, (req, res) => {
    if (!safeFileName(req.params.fileName)) return res.status(404).end();
    return res.sendFile(req.params.fileName, { root: photoRoot, dotfiles: "deny" });
  });

  app.delete("/api/uploads/site-photos/:fileName", requireAuth, async (req, res, next) => {
    if (!safeFileName(req.params.fileName)) return res.status(404).end();
    try {
      const record = await pool.query("select uploader_code from upload_records where file_name = $1", [req.params.fileName]);
      if (record.rowCount !== 1) return res.status(404).end();
      if (req.auth.role !== "admin" && record.rows[0].uploader_code !== req.auth.code) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      await fs.unlink(path.join(photoRoot, req.params.fileName)).catch(error => {
        if (error.code !== "ENOENT") throw error;
      });
      await pool.query("delete from upload_records where file_name = $1", [req.params.fileName]);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
}
