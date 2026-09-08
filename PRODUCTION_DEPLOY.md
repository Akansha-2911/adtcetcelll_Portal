# SPVN CET Portal - Production Deployment

## 1. Required environment variables
Set at minimum:
- `NODE_ENV=production`
- `MONGO_URI`
- `SESSION_SECRET` (32+ random characters)
- `MOBILE_API_SECRET` (32+ random characters)
- `GEMINI_API_KEY` for Upload Test vision/OCR

Use `.env.example` as the full reference. Never upload a real `.env` to GitHub.

## 2. Install and validate
```bash
npm ci
npm run verify
npm run prod:check
```

## 3. MongoDB indexes
After deploying against the production database, run once:
```bash
npm run db:indexes
```
This creates/synchronizes indexes used by Question Bank hierarchy, Tests, Users, Results and Notifications.

## 4. Persistent uploads
Production uploads must not rely on an ephemeral deployment filesystem.
Attach a persistent disk or object storage. For a Render persistent disk, mount it and set:
```env
UPLOAD_ROOT_DIR=/var/data/spvn-uploads
```
The application serves that directory at `/uploads/...` automatically.

## 5. Admin account
For a brand-new database, temporarily set:
```env
AUTO_SEED_ADMIN=true
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```
Deploy once, confirm the admin exists, then set `AUTO_SEED_ADMIN=false`.
The production app never creates a default admin/password automatically.

## 6. Render
A `render.yaml` is included. Set the secret values in Render. If you need uploads to survive deploys/restarts, attach a persistent disk and set its mount path as `UPLOAD_ROOT_DIR`.

## 7. Health checks
- `/health/live` - server process is alive
- `/health/ready` - server and MongoDB are ready

## Production improvements included
- gzip/brotli-compatible HTTP compression via Express compression
- long-lived static asset caching
- MongoDB-backed sessions
- secure production cookies
- production environment validation
- authentication rate limiting
- restricted production CORS for mobile API
- persistent upload directory support
- MongoDB query indexes
- graceful shutdown for deploy/restart
- HTTP keep-alive/request timeout tuning
- production-safe error pages
- no default production admin credentials
- `.env` secrets excluded from the production ZIP
