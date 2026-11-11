import "dotenv/config";
import express from "express";
import cron from "node-cron";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { runPipeline, matchUser } from "./worker.js";

const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../public")));

const list = (v: unknown) =>
  (Array.isArray(v) ? v : String(v ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
const prefs = (b: any) => ({
  skills: JSON.stringify(list(b.skills)), roles: JSON.stringify(list(b.roles)),
  location: String(b.location ?? "").trim().slice(0, 80),
  remote_only: b.remoteOnly ? 1 : 0, entry_level: b.entryLevel === false ? 0 : 1,
  min_score: Math.min(100, Math.max(0, Number(b.minScore) || 40)),
});
const byToken = (t: string) => db.prepare("SELECT * FROM users WHERE token=?").get(t) as any;

app.post("/api/signup", (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!list(req.body.skills).length) return res.status(400).json({ error: "Add at least one skill." });
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
    return res.status(409).json({ error: "This email is already registered. Use the dashboard link from your last JobPulse email." });
  const token = crypto.randomBytes(16).toString("hex");
  db.prepare(`INSERT INTO users(email,token,skills,roles,location,remote_only,entry_level,min_score)
    VALUES(@email,@token,@skills,@roles,@location,@remote_only,@entry_level,@min_score)`).run({ email, token, ...prefs(req.body) });
  matchUser(byToken(token));
  res.json({ token });
});

app.get("/api/me/:token", (req, res) => {
  const u = byToken(req.params.token);
  if (!u) return res.status(404).json({ error: "Not found" });
  const matches = db.prepare(`SELECT m.job_id AS id, m.score, m.reasons, m.status, j.title, j.company, j.location, j.url, j.source
    FROM matches m JOIN jobs j ON j.id=m.job_id WHERE m.user_id=? ORDER BY m.score DESC, j.posted_at DESC LIMIT 200`).all(u.id)
    .map((m: any) => ({ ...m, reasons: JSON.parse(m.reasons) }));
  res.json({
    profile: { email: u.email, skills: JSON.parse(u.skills), roles: JSON.parse(u.roles), location: u.location,
      remoteOnly: !!u.remote_only, entryLevel: !!u.entry_level, minScore: u.min_score, active: !!u.active },
    matches,
  });
});

app.put("/api/me/:token", (req, res) => {
  const u = byToken(req.params.token);
  if (!u) return res.status(404).json({ error: "Not found" });
  if (!list(req.body.skills).length) return res.status(400).json({ error: "Add at least one skill." });
  db.prepare(`UPDATE users SET skills=@skills,roles=@roles,location=@location,remote_only=@remote_only,
    entry_level=@entry_level,min_score=@min_score,active=1 WHERE id=@id`).run({ id: u.id, ...prefs(req.body) });
  matchUser(byToken(req.params.token));
  res.json({ ok: true });
});

app.post("/api/me/:token/status", (req, res) => {
  const u = byToken(req.params.token);
  const { jobId, status } = req.body ?? {};
  if (!u || !["new", "saved", "applied", "ignored"].includes(status)) return res.status(400).json({ error: "Bad request" });
  db.prepare("UPDATE matches SET status=? WHERE user_id=? AND job_id=?").run(status, u.id, String(jobId));
  res.json({ ok: true });
});

app.get("/unsubscribe", (req, res) => {
  const r = db.prepare("UPDATE users SET active=0 WHERE token=?").run(String(req.query.token ?? ""));
  res.send(r.changes ? "You're unsubscribed from JobPulse emails." : "Link not recognised.");
});

app.post("/api/run", async (req, res) => {
  if (!process.env.ADMIN_KEY || req.header("x-admin-key") !== process.env.ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  res.json(await runPipeline());
});

cron.schedule(process.env.CRON_SCHEDULE || "0 8 * * *", () =>
  runPipeline().then((r) => console.log("[cron] done", r)).catch((e) => console.error("[cron] failed", e)));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`JobPulse running on http://localhost:${port}`));
