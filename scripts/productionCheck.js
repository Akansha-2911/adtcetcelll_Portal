require('dotenv').config();
const fs = require('fs');
const path = require('path');

const errors = [];
const warnings = [];
if (!String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim()) errors.push('MONGO_URI (or MONGODB_URI) is missing.');
if (!String(process.env.SESSION_SECRET || '').trim()) errors.push('SESSION_SECRET is missing.');
if (String(process.env.SESSION_SECRET || '').length < 32) errors.push('SESSION_SECRET must be at least 32 characters.');
if (!String(process.env.GEMINI_API_KEY || '').trim()) warnings.push('GEMINI_API_KEY is missing; AI vision extraction will be unavailable.');
if (!String(process.env.ALLOWED_ORIGINS || '').trim()) warnings.push('ALLOWED_ORIGINS is empty; configure it if the mobile/web API is called from a browser origin.');
if (!String(process.env.UPLOAD_ROOT_DIR || '').trim()) warnings.push('UPLOAD_ROOT_DIR is empty; use a persistent disk path in production to preserve uploads across deploys.');
if (String(process.env.AUTO_SEED_ADMIN || '') === 'true' && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) errors.push('AUTO_SEED_ADMIN=true requires ADMIN_EMAIL and ADMIN_PASSWORD.');

const uploadRoot = process.env.UPLOAD_ROOT_DIR ? path.resolve(process.env.UPLOAD_ROOT_DIR) : path.join(__dirname, '../public/uploads');
try { fs.mkdirSync(uploadRoot, { recursive: true }); } catch (error) { errors.push(`Upload directory is not writable: ${uploadRoot}`); }

warnings.forEach((item) => console.warn('⚠️ ' + item));
if (errors.length) {
  errors.forEach((item) => console.error('❌ ' + item));
  process.exit(1);
}
console.log('✅ Production environment check passed.');
