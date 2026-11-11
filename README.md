# JobPulse: personalised job alerts for CS grads

Fetches new software jobs from public APIs (Remotive, Arbeitnow, RemoteOK), scores each against a
user's skills and preferences, and emails the best matches daily. Dashboard to save / apply / hide.

**Stack:** Node, TypeScript, Express, SQLite (built-in node:sqlite, Node 22.13+), node-cron, Nodemailer, vanilla JS frontend.

## Run
```bash
npm install
cp .env.example .env     # set ADMIN_KEY; add SMTP_* to send real email
npm start                # http://localhost:3000
```
1. Open the site and sign up with your skills.
2. Trigger a fetch + email now (otherwise it runs daily at 08:00):
```bash
curl -X POST http://localhost:3000/api/run -H "x-admin-key: change-me"
```
Without `SMTP_HOST`, emails are printed to the console (dry-run). For Gmail use `smtp.gmail.com`, port 587, and an App Password.

## How matching works (src/match.ts)
- **Hard filters:** remote-only, location, hide senior titles for entry-level users
- **Score (0-100):** up to 70 for skill overlap, +20 title matches a wanted role, +10 junior/grad/intern wording
- **Explanation** per job: matched skills, and popular skills the job asks for that you haven't listed

## Architecture
`sources.ts` (fetch) -> `worker.ts` (dedupe, match, email) -> `mailer.ts`; `server.ts` exposes the API + cron.

## Ideas to extend (good talking points)
- Claude API to parse an uploaded resume and write a one-line "why this fits" per job
- Embeddings (pgvector) instead of keyword matching; Postgres instead of SQLite
- Password / magic-link auth, Docker, tests for `scoreJob`, deploy to Render/Railway (mount a volume for the DB)
