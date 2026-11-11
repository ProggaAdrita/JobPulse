import type { Job } from "./sources.js";

export type Profile = {
  skills: string[]; roles: string[]; location: string;
  remote_only: number; entry_level: number; min_score: number;
};

// Used only to tell the user which popular skills a job mentions that they haven't listed.
const VOCAB = ["javascript", "typescript", "react", "node", "python", "java", "sql", "postgresql", "mongodb",
  "docker", "kubernetes", "aws", "azure", "gcp", "git", "django", "flask", "spring", "next.js", "express",
  "graphql", "redis", "c++", "go", "php", "laravel", "angular", "vue", "tailwind", "linux", "ci/cd"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
const has = (text: string, term: string) =>
  new RegExp(`(?<![a-z0-9+#])${esc(term.trim())}(?![a-z0-9+#])`, "i").test(text);

const SENIOR = /\b(senior|sr\.?|lead|principal|staff|head|director|manager|architect)\b/i;
const JUNIOR = /\b(junior|jr\.?|graduate|entry[- ]level|intern(ship)?|trainee|associate|fresher)\b/i;

/** Returns null if the job fails a hard filter, else a 0-100 score with human-readable reasons. */
export function scoreJob(p: Profile, j: Job): { score: number; reasons: string[] } | null {
  if (p.remote_only && !j.remote) return null;
  if (p.location && !j.remote && !j.location.toLowerCase().includes(p.location.toLowerCase())) return null;
  if (p.entry_level && SENIOR.test(j.title)) return null;

  const text = `${j.title} ${j.description}`;
  const matched = p.skills.filter((s) => has(text, s));
  const need = Math.max(1, Math.min(p.skills.length, 6));
  let score = Math.round(Math.min(matched.length / need, 1) * 70);

  const role = p.roles.find((r) => j.title.toLowerCase().includes(r.toLowerCase()));
  const junior = !!p.entry_level && JUNIOR.test(j.title);
  if (role) score += 20;
  if (junior) score += 10;

  const reasons: string[] = [];
  if (matched.length) reasons.push(`Matches your skills: ${matched.slice(0, 6).join(", ")}`);
  if (role) reasons.push(`Title fits "${role}"`);
  if (junior) reasons.push("Entry-level friendly");
  const mine = p.skills.map((s) => s.toLowerCase());
  const missing = VOCAB.filter((v) => !mine.includes(v) && has(text, v)).slice(0, 3);
  if (missing.length) reasons.push(`Also asks for: ${missing.join(", ")}`);
  return { score: Math.min(score, 100), reasons };
}
