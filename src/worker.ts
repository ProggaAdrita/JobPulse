import { db, tx } from "./db.js";
import { fetchAllJobs } from "./sources.js";
import { scoreJob } from "./match.js";
import { sendDigest } from "./mailer.js";

const toProfile = (u: any) => ({ ...u, skills: JSON.parse(u.skills), roles: JSON.parse(u.roles) });

/** Score jobs already in the DB for one user and store matches above their threshold. */
export function matchUser(u: any) {
  const p = toProfile(u);
  const jobs = db.prepare("SELECT * FROM jobs WHERE fetched_at > datetime('now','-14 days')").all() as any[];
  const ins = db.prepare("INSERT OR IGNORE INTO matches(user_id,job_id,score,reasons) VALUES(?,?,?,?)");
  tx(() => {
    for (const j of jobs) {
      const r = scoreJob(p, { ...j, remote: !!j.remote });
      if (r && r.score >= u.min_score) ins.run(u.id, j.id, r.score, JSON.stringify(r.reasons));
    }
  });
}

/** Fetch jobs -> match every active user -> email each user their top new matches. */
export async function runPipeline() {
  const jobs = await fetchAllJobs();
  const ins = db.prepare(`INSERT OR IGNORE INTO jobs(id,title,company,location,remote,url,description,source,posted_at)
    VALUES(@id,@title,@company,@location,@remote,@url,@description,@source,@posted_at)`);
  tx(() => { for (const j of jobs) ins.run(Object.fromEntries(Object.entries({ ...j, remote: j.remote ? 1 : 0 }).map(([k, v]) => [k, v ?? null])) as any); });

  const users = db.prepare("SELECT * FROM users WHERE active=1").all() as any[];
  const mark = db.prepare("UPDATE matches SET emailed=1 WHERE user_id=? AND job_id=?");
  let emails = 0;
  for (const u of users) {
    matchUser(u);
    const rows = db.prepare(`SELECT m.job_id, m.score, m.reasons, j.title, j.company, j.location, j.url
      FROM matches m JOIN jobs j ON j.id=m.job_id
      WHERE m.user_id=? AND m.emailed=0 AND m.status='new' ORDER BY m.score DESC LIMIT 10`).all(u.id) as any[];
    if (!rows.length) continue;
    try {
      await sendDigest(u, rows.map((r) => ({ ...r, reasons: JSON.parse(r.reasons) })));
      tx(() => rows.forEach((r) => mark.run(u.id, r.job_id)));
      emails++;
    } catch (e) { console.error("[mail] failed for", u.email, e); }
  }
  return { fetched: jobs.length, users: users.length, emails };
}
