#!/usr/bin/env node
require('dotenv').config();
const net = require('net');
const dns = require('dns').promises;
const { URL } = require('url');

let failed = false;
const pass = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.warn(`! ${m}`);
const fail = (m) => { failed = true; console.error(`✗ ${m}`); };

function parseMongoTarget(uri) {
  if (!uri) return null;
  if (uri.startsWith('mongodb+srv://')) {
    const raw = uri.replace('mongodb+srv://', 'mongodb://');
    const u = new URL(raw);
    return { srv: true, host: u.hostname };
  }
  const u = new URL(uri);
  return { srv: false, host: u.hostname, port: Number(u.port || 27017) };
}

async function tcp(host, port, timeout=5000) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    const done = (err) => { s.destroy(); err ? reject(err) : resolve(); };
    s.setTimeout(timeout, () => done(new Error('timeout')));
    s.once('connect', () => done());
    s.once('error', done);
  });
}

(async () => {
  console.log('SPVN CET Portal — runtime preflight\n');
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const secret = process.env.SESSION_SECRET || '';

  process.version.startsWith('v18.') || Number(process.versions.node.split('.')[0]) >= 18
    ? pass(`Node ${process.version}`) : fail(`Node ${process.version}; Node 18+ recommended`);

  if (!uri) fail('MONGO_URI is missing'); else pass('MONGO_URI is configured');
  if (process.env.NODE_ENV === 'production' && secret.length < 32) fail('SESSION_SECRET should be at least 32 characters in production');
  else if (!secret) warn('SESSION_SECRET missing; development fallback will be used');
  else pass('SESSION_SECRET is configured');

  if (uri) {
    try {
      const target = parseMongoTarget(uri);
      if (target.srv) {
        const records = await dns.resolveSrv(`_mongodb._tcp.${target.host}`);
        pass(`MongoDB SRV DNS resolved (${records.length} record${records.length === 1 ? '' : 's'})`);
        if (records[0]) {
          await tcp(records[0].name, records[0].port);
          pass(`MongoDB TCP reachable on ${records[0].port}`);
        }
      } else {
        await dns.lookup(target.host);
        pass(`MongoDB host resolved: ${target.host}`);
        await tcp(target.host, target.port);
        pass(`MongoDB TCP reachable on ${target.port}`);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'production') fail(`MongoDB network preflight failed: ${err.message}`);
      else warn(`MongoDB network preflight unavailable in development: ${err.message}. The app will retry MONGO_FALLBACK_URI if configured.`);
    }
  }

  console.log('\nRun `npm run verify` for static project verification.');
  if (failed) process.exit(1);
})();
