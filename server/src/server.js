import express from "express";
import cookieParser from "cookie-parser";
import { pool, waitForDatabase } from "./db.js";
import { registerAuthRoutes } from "./auth.js";
import { registerDataRoutes } from "./data.js";
import { registerUploadRoutes } from "./uploads.js";
import { registerAdminRoutes } from "./admin.js";
import { registerFuelRoutes } from "./fuel.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
// Client -> Traefik -> nginx -> API.
app.set("trust proxy", 2);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") || req.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return res.status(403).json({ error: "Origine refusée" });
    } catch {
      return res.status(403).json({ error: "Origine refusée" });
    }
  }
  return next();
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

registerAuthRoutes(app);
registerDataRoutes(app);
registerUploadRoutes(app);
registerAdminRoutes(app);
registerFuelRoutes(app);

app.use((req, res) => res.status(404).json({ error: "Route introuvable" }));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Fichier trop volumineux" });
  if (error?.code === "23505") return res.status(409).json({ error: "Cette valeur existe déjà" });
  if (error?.code === "23503") return res.status(409).json({ error: "Élément lié introuvable" });
  if (error instanceof SyntaxError) return res.status(400).json({ error: "Requête invalide" });
  return res.status(500).json({ error: "Erreur serveur" });
});

await waitForDatabase();
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`DRIVE API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
