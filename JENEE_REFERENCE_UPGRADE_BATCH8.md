# SPVN CET Portal — Jenee Reference Upgrade Batch 8

## Goal
Final integration hardening and end-to-end readiness pass after the UI/feature batches.

## Runtime/logic fixes completed

1. **Student test authorization hardened**
   - Students can open/start only tests assigned to one of their batches.
   - Direct URL access to another batch's test is rejected.

2. **Test schedule enforcement**
   - Upcoming tests cannot be started early through a direct URL.
   - Ended tests cannot be newly started.
   - An in-progress exam respects the scheduled test end time in addition to its duration.
   - Closing a test from Admin causes an open attempt to auto-submit on the next exam request.

3. **Leaderboard privacy/access**
   - Student leaderboard access now requires batch assignment.
   - When immediate results are hidden, the student leaderboard is hidden too.

4. **Marking-template consistency**
   - Detailed result review now uses the answer-key override from the Marking Template.
   - Downloaded result PDF uses the same effective answer key.
   - This keeps scoring, on-screen review and PDF review consistent.

5. **Zero negative marking fixed**
   - Admin can now explicitly configure `0` negative marks.
   - Previous `parseFloat(value) || 0.25` behavior incorrectly converted 0 to 0.25.

6. **MongoDB/serverless boot behavior hardened**
   - Database connection errors now throw back to the boot layer instead of unconditionally terminating the process from `config/database.js`.
   - Normal `node app.js` startup still exits correctly if initial DB connection fails.

## Automated verification added

Run:

```bash
npm run verify
```

It checks:
- JavaScript syntax across the project.
- EJS delimiter balance.
- Route → controller method wiring.
- Every statically referenced rendered EJS view exists.
- Essential project files exist.

Batch 8 verification result in the build workspace: **9/9 checks passed**.

## Environment note
A true database-backed login → create test → publish → student exam → submit → reports browser run requires a reachable MongoDB instance and installed npm dependencies. The supplied project archive does not contain a configured `.env` or database endpoint, so this batch adds `.env.example` and performs all environment-independent integration checks plus the runtime logic fixes above.
