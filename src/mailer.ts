import nodemailer from "nodemailer";

export type DigestRow = { title: string; company: string; location: string; url: string; score: number; reasons: string[] };

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function sendDigest(user: { email: string; token: string }, rows: DigestRow[]) {
  const base = process.env.BASE_URL || "http://localhost:3000";
  const items = rows.map((r) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e3e8ef">
      <div style="font-size:13px;color:#566478">${r.score}% match</div>
      <a href="${esc(r.url)}" style="font-size:17px;font-weight:600;color:#0e1a2b;text-decoration:none">${esc(r.title)}</a>
      <div style="color:#566478">${esc(r.company)}${r.location ? ", " + esc(r.location) : ""}</div>
      <div style="font-size:13px;color:#566478;margin-top:4px">${r.reasons.map(esc).join("<br>")}</div>
    </td></tr>`).join("");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;color:#0e1a2b">
    <h2 style="margin:0 0 4px">${rows.length} new job match${rows.length > 1 ? "es" : ""} for you</h2>
    <table width="100%" cellspacing="0">${items}</table>
    <p style="margin-top:20px"><a href="${base}/?t=${user.token}">Open your dashboard</a> to save or hide jobs.</p>
    <p style="font-size:12px;color:#8793a5"><a href="${base}/unsubscribe?token=${user.token}">Unsubscribe</a></p></div>`;
  const subject = `JobPulse: ${rows.length} new match${rows.length > 1 ? "es" : ""}, top score ${rows[0].score}%`;

  if (!process.env.SMTP_HOST) {
    console.log(`\n[mail dry-run] To: ${user.email}\nSubject: ${subject}\n` + rows.map((r) => ` - ${r.score}% ${r.title} @ ${r.company} ${r.url}`).join("\n") + "\n");
    return;
  }
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject, html });
}
