import crypto from "node:crypto";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { pool, transaction } from "./db.js";

const COOKIE_NAME = "drive_session";
const ttlDays = Math.min(30, Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30)));
const cookieSecure = process.env.COOKIE_SECURE !== "false";

const normalizeCode = value => String(value || "").trim().toUpperCase().slice(0, 20);
const validPin = value => /^\d{4,12}$/.test(String(value || ""));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function verifyPin(pin, credential) {
  if (credential.pin_hash) return argon2.verify(credential.pin_hash, pin);
  if (!credential.legacy_pin) return false;
  const legacy = credential.legacy_pin;
  return /^[a-f0-9]{64}$/i.test(legacy)
    ? safeEqual(sha256(pin), legacy.toLowerCase())
    : safeEqual(pin, legacy);
}

async function recordLogin(code, success) {
  try {
    await pool.query(
      "insert into login_logs (technician_code, success) values ($1, $2)",
      [code || "UNKNOWN", success],
    );
  } catch (error) {
    console.warn("Unable to record login attempt", error.message);
  }
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60 * 1_000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "strict",
    path: "/",
  });
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Authentification requise" });

  try {
    const result = await pool.query(
      `select s.id as session_id, s.expires_at,
              t.id, t.code, t.name, t.role, t.avatar_url, t.active
         from sessions s
         join technicians t on t.id = s.technician_id
        where s.token_hash = $1 and s.expires_at > now() and t.active = true`,
      [sha256(token)],
    );
    if (result.rowCount !== 1) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expirée" });
    }
    req.auth = result.rows[0];
    pool.query("update sessions set last_seen = now() where id = $1", [req.auth.session_id]).catch(() => {});
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") return res.status(403).json({ error: "Accès administrateur requis" });
  return next();
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez plus tard." },
});

export function registerAuthRoutes(app) {
  app.post("/api/auth/identify", authLimiter, async (req, res, next) => {
    try {
      const code = normalizeCode(req.body?.code);
      if (!code) return res.status(400).json({ error: "Code requis" });
      const result = await pool.query(
        `select t.code, t.name, exists(
           select 1 from technician_credentials c
            where c.technician_id = t.id and (c.pin_hash is not null or c.legacy_pin is not null)
         ) as has_pin
           from technicians t where t.code = $1 and t.active = true`,
        [code],
      );
      if (result.rowCount !== 1) {
        await recordLogin(code, false);
        return res.status(404).json({ error: "Code inconnu" });
      }
      const tech = result.rows[0];
      if (!tech.has_pin) return res.status(403).json({ error: "PIN non configuré. Contactez un administrateur." });
      return res.json({ tech: { code: tech.code, name: tech.name }, needPin: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res, next) => {
    const code = normalizeCode(req.body?.code);
    const pin = String(req.body?.pin || "");
    if (!code || !validPin(pin)) return res.status(400).json({ error: "Code et PIN requis" });

    try {
      const result = await pool.query(
        `select t.id, t.code, t.name, t.role, t.avatar_url, t.active,
                c.pin_hash, c.legacy_pin
           from technicians t
           left join technician_credentials c on c.technician_id = t.id
          where t.code = $1`,
        [code],
      );
      const tech = result.rows[0];
      const accepted = tech?.active === true && await verifyPin(pin, tech);
      if (!accepted) {
        await recordLogin(code, false);
        return res.status(401).json({ error: "Code ou PIN incorrect" });
      }

      const token = crypto.randomBytes(32).toString("base64url");
      await transaction(async client => {
        if (!tech.pin_hash) {
          const newHash = await argon2.hash(pin, { type: argon2.argon2id });
          await client.query(
            "update technician_credentials set pin_hash = $1, legacy_pin = null, updated_at = now() where technician_id = $2",
            [newHash, tech.id],
          );
        }
        await client.query("delete from sessions where expires_at <= now()");
        await client.query(
          `insert into sessions (technician_id, token_hash, expires_at, ip_address, user_agent)
           values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
          [tech.id, sha256(token), ttlDays, req.ip, String(req.get("user-agent") || "").slice(0, 500)],
        );
        await client.query("update technicians set last_login = now() where id = $1", [tech.id]);
        await client.query("insert into login_logs (technician_code, success) values ($1, true)", [code]);
      });

      setSessionCookie(res, token);
      return res.json({ tech: { code: tech.code, name: tech.name, role: tech.role, avatar_url: tech.avatar_url || "" } });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/auth/session", requireAuth, (req, res) => {
    const { code, name, role, avatar_url } = req.auth;
    res.json({ tech: { code, name, role, avatar_url: avatar_url || "" } });
  });

  app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
    try {
      await pool.query("delete from sessions where id = $1", [req.auth.session_id]);
      clearSessionCookie(res);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/admin/technicians/:id/pin", requireAuth, requireAdmin, async (req, res, next) => {
    const pin = String(req.body?.pin || "");
    if (!validPin(pin)) return res.status(400).json({ error: "Le PIN doit contenir 4 à 12 chiffres" });
    try {
      const hash = await argon2.hash(pin, { type: argon2.argon2id });
      const result = await pool.query(
        `insert into technician_credentials (technician_id, pin_hash)
         values ($1, $2)
         on conflict (technician_id) do update
           set pin_hash = excluded.pin_hash, legacy_pin = null, updated_at = now()
         returning technician_id`,
        [req.params.id, hash],
      );
      if (result.rowCount !== 1) return res.status(404).json({ error: "Technicien introuvable" });
      await pool.query("delete from sessions where technician_id = $1", [req.params.id]);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
}
