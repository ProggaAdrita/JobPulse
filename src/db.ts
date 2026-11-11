import { DatabaseSync } from "node:sqlite";

export const db = new DatabaseSync(process.env.DB_PATH || "jobpulse.db");
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL,
  skills TEXT NOT NULL, roles TEXT NOT NULL, location TEXT DEFAULT '',
  remote_only INTEGER DEFAULT 0, entry_level INTEGER DEFAULT 1, min_score INTEGER DEFAULT 40,
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY, title TEXT, company TEXT, location TEXT, remote INTEGER, url TEXT,
  description TEXT, source TEXT, posted_at TEXT, fetched_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS matches(
  user_id INTEGER, job_id TEXT, score INTEGER, reasons TEXT,
  status TEXT DEFAULT 'new', emailed INTEGER DEFAULT 0, PRIMARY KEY(user_id, job_id));
`);

/** Run fn inside a transaction (node:sqlite has no built-in helper). */
export function tx(fn: () => void) {
  db.exec("BEGIN");
  try { fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
}
