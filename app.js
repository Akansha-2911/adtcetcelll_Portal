// app.js — CET Examination System (MongoDB / Mongoose)
require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const fileUpload     = require('express-fileupload');
const methodOverride = require('method-override');
const path           = require('path');
const compression    = require('compression');
const helmet         = require('helmet');
const { MongoStore } = require('connect-mongo');
const { uploadRoot } = require('./utils/storagePaths');

const { connect } = require('./config/database');
const { APP_TIME_ZONE } = require('./utils/dateTime');
require('./models'); // register all schemas

const { attachUser, errorHandler, notFound } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const startedAt = Date.now();
let bootState = { status: 'idle', error: null, connectedAt: null };

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim()) missing.push('MONGO_URI (or MONGODB_URI)');
  if (!String(process.env.SESSION_SECRET || '').trim()) missing.push('SESSION_SECRET');
  if (missing.length) throw new Error('Missing required production environment variables: ' + missing.join(', '));
  if (String(process.env.SESSION_SECRET || '').length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
  if (!String(process.env.MOBILE_API_SECRET || process.env.SESSION_SECRET || '').trim()) {
    throw new Error('MOBILE_API_SECRET or SESSION_SECRET is required in production.');
  }
}

validateProductionEnvironment();


// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.appTimeZone = APP_TIME_ZONE;

// ── Static files ──────────────────────────────────────────────────────────────
// Runtime uploads may live on a persistent disk outside /public.
app.use('/uploads', express.static(uploadRoot, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
  lastModified: true,
  fallthrough: true,
}));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d', etag: true, lastModified: true,
  setHeaders: (res, fp) => {
    if (fp.endsWith('.html') || fp.endsWith('.json'))
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    else if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/.test(fp))
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  },
}));
app.use('/vendor/katex', express.static(path.join(__dirname, 'node_modules', 'katex', 'dist'), {
  maxAge: '30d',
  immutable: true,
}));

// ── Body / file parsers ───────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 20000 }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride('_method'));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024 },
  useTempFiles: false,
  abortOnLimit: true,
}));

// ── Sessions (stored in MongoDB) ──────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/svpn_test';
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'spvn_local_development_secret_key_123456789';
const SESSION_SECURE = process.env.SESSION_SECURE !== undefined
  ? String(process.env.SESSION_SECURE).toLowerCase() === 'true'
  : isProduction;
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000;

if (isProduction && (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 32)) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}

let sessionStore;
if (isProduction || process.env.SESSION_STORE === 'mongo') {
  sessionStore = MongoStore.create({
    mongoUrl: MONGO_URI,
    ttl: 24 * 60 * 60,
    autoRemove: 'native',
    touchAfter: 10 * 60,
  });
  sessionStore.on('error', error => {
    console.error('❌ Session store error:', error.message);
  });
} else {
  // Development: keep sessions in memory so an Atlas DNS outage does not produce
  // a second connect-mongo error while the database connection is being diagnosed.
  sessionStore = new session.MemoryStore();
  console.log('ℹ️ Development session store: memory');
}

app.use(session({
  name: 'spvn.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: isProduction,
  store: sessionStore,
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: SESSION_SECURE,
    sameSite: 'lax',
    path: '/',
  },
}));

console.log(`🔐 Session cookie: ${SESSION_SECURE ? 'secure HTTPS' : 'local/HTTP'}`);

app.use(flash());
app.use(attachUser);

// ── No-cache for HTML pages ───────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/uploads'))
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});


// ── Runtime health endpoints ──────────────────────────────────────────────────
// Liveness does not require MongoDB and is suitable for Render/Vercel health checks.
app.get('/health/live', (req, res) => {
  res.status(200).json({
    ok: true,
    service: process.env.APP_NAME || 'SPVN CET Portal',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Readiness reports DB boot state without exposing connection secrets.
app.get('/health/ready', async (req, res) => {
  try {
    await boot();
    return res.status(200).json({ ok: true, database: 'connected', boot: bootState.status });
  } catch (err) {
    return res.status(503).json({ ok: false, database: 'unavailable', boot: bootState.status, message: err.message });
  }
});

// Connect before any web or mobile route handles a request. This also covers
// serverless deployments, where `require.main === module` is false.
app.use(async (req, res, next) => {
  try {
    await boot();
    next();
  } catch (e) {
    if (req.path.startsWith('/health/')) return next(e);
    const isDns = /ENOTFOUND|querySrv|ETIMEOUT/i.test(String(e.message || ''));
    return res.status(503).render('error', {
      statusCode: 503,
      title: 'Database connection unavailable',
      message: isDns
        ? 'MongoDB Atlas could not be resolved. Check internet/DNS and the MONGO_URI in .env. In development the portal also retries local MongoDB at 127.0.0.1:27017.'
        : 'The database is temporarily unavailable: ' + e.message,
      error: e,
    });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',    require('./routes/auth'));
app.use('/admin',   require('./routes/admin'));
app.use('/student', require('./routes/student'));
app.use('/exam',    require('./routes/exam'));
app.use('/results', require('./routes/results'));
app.use('/api/mobile', require('./routes/mobileApi'));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect(`/${req.session.user.role}/dashboard`);
  res.render('auth/portal-select', { title: 'Login — ' + (process.env.COLLEGE_SHORT_NAME || 'SPVN CET') + ' Portal' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
let bootPromise = null;

function boot() {
  if (bootPromise) return bootPromise;
  bootState = { status: 'connecting', error: null, connectedAt: null };
  bootPromise = (async () => {
    await connect();
    bootState = { status: 'ready', error: null, connectedAt: new Date().toISOString() };

    // Seed an admin only when explicitly enabled. Never create default credentials in production.
    try {
      const { User } = require('./models');
      const exists = await User.findOne({ role: 'admin' }).select('_id').lean();
      const autoSeed = process.env.AUTO_SEED_ADMIN === 'true' || (process.env.NODE_ENV !== 'production' && process.env.AUTO_SEED_ADMIN !== 'false');
      if (!exists && autoSeed) {
        const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
        const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();
        const adminName = String(process.env.ADMIN_NAME || 'Administrator').trim();
        if (!adminEmail || !adminPassword) {
          if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required when AUTO_SEED_ADMIN=true.');
          console.warn('⚠️ Admin auto-seed skipped because ADMIN_EMAIL/ADMIN_PASSWORD are not configured.');
        } else {
          await User.create({ name: adminName, email: adminEmail, password: adminPassword, role: 'admin', isActive: true, isFirstLogin: false });
          console.log(`✅ Admin seeded → ${adminEmail}`);
        }
      }
    } catch (e) { console.error('Admin seed error:', e.message); }
  })();
  bootPromise.catch((err) => {
    bootState = { status: 'error', error: err.message, connectedAt: null };
    bootPromise = null;
  });
  return bootPromise;
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 ${process.env.APP_NAME || 'CET Exam Portal'} — http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Warm the database after HTTP starts. In development this keeps the
  // diagnostic page available even if Atlas DNS is temporarily unavailable.
  boot().catch(e => {
    console.error('❌ Database boot failed:', e.message);
    console.error('   Server remains online. Check /health/live and /health/ready.');
  });

  server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 10) || 65000;
  server.headersTimeout = parseInt(process.env.HEADERS_TIMEOUT_MS, 10) || 66000;
  server.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 120000;

  const shutdown = (signal) => {
    console.log(`\n${signal} received. Closing HTTP server...`);
    server.close(async () => {
      try {
        const { mongoose } = require('./config/database');
        await mongoose.connection.close(false);
      } catch (error) {
        console.error('MongoDB shutdown error:', error.message);
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
