# SPVN CET Portal — Jenee Upgrade Batch 9

## Runtime hardening completed

- Added `/health/live` liveness endpoint that works without MongoDB.
- Added `/health/ready` readiness endpoint that verifies application boot/database readiness.
- Added `npm run preflight` for Node, environment, MongoDB DNS, and TCP connectivity checks.
- Added `npm run check:all` to run static verification followed by runtime preflight.
- Made MongoDB connection initialization idempotent to avoid duplicate concurrent connection attempts.
- Added explicit boot state tracking for deployment diagnostics.
- Restricted all `/exam/*` routes to authenticated students only.
- Hardened admin/student login input validation.
- Regenerates the session after successful authentication to reduce session-fixation risk.
- Persists the first-login password-change session before redirecting.
- Expanded `.env.example` with branding, timezone, academic-year, and DB pool settings.

## Verification available without production secrets

Run:

```bash
npm run verify
```

For a machine that has the real `.env`/MongoDB access, run:

```bash
npm run preflight
npm run start
```

Then verify:

- `GET /health/live`
- `GET /health/ready`
- Admin login -> dashboard -> create/publish test
- Student login -> instructions -> exam -> submit -> result
- Admin results -> leaderboard -> question analysis

A true database-backed end-to-end run still requires the real `MONGO_URI` and environment credentials; they are intentionally not included in this archive.
