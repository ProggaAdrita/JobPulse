// Public job APIs that allow programmatic access (no scraping of LinkedIn/Indeed).
export type Job = {
  id: string; title: string; company: string; location: string; remote: boolean;
  url: string; description: string; source: string; posted_at: string;
};

const strip = (h: string) =>
  String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&[#\w]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);

async function getJSON(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "JobPulse/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

const sources: Record<string, () => Promise<Job[]>> = {
  async remotive() {
    const d = await getJSON("https://remotive.com/api/remote-jobs?category=software-dev&limit=150");
    return d.jobs.map((j: any): Job => ({
      id: `remotive:${j.id}`, title: j.title, company: j.company_name,
      location: j.candidate_required_location || "Remote", remote: true, url: j.url,
      description: strip(j.description), source: "Remotive", posted_at: j.publication_date,
    }));
  },
  async arbeitnow() {
    const d = await getJSON("https://www.arbeitnow.com/api/job-board-api");
    return d.data.map((j: any): Job => ({
      id: `arbeitnow:${j.slug}`, title: j.title, company: j.company_name, location: j.location || "",
      remote: !!j.remote, url: j.url, description: strip(j.description), source: "Arbeitnow",
      posted_at: new Date((j.created_at || 0) * 1000).toISOString(),
    }));
  },
  async remoteok() {
    const d = await getJSON("https://remoteok.com/api");
    return d.filter((j: any) => j.position).map((j: any): Job => ({
      id: `remoteok:${j.id}`, title: j.position, company: j.company, location: j.location || "Remote",
      remote: true, url: j.url, description: strip(`${j.description} ${(j.tags || []).join(" ")}`),
      source: "RemoteOK", posted_at: j.date,
    }));
  },
};

export async function fetchAllJobs(): Promise<Job[]> {
  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map((n) => sources[n]()));
  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") { console.log(`[sources] ${names[i]}: ${r.value.length} jobs`); return r.value; }
    console.error(`[sources] ${names[i]} failed:`, r.reason?.message ?? r.reason);
    return [];
  });
}
