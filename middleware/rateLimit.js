// Lightweight in-process rate limiter for authentication endpoints.
// For multi-instance deployments, replace with a shared Redis-backed limiter.
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many requests. Please try again later.' } = {}) {
  const buckets = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets.entries()) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(windowMs, 60 * 1000));
  cleanup.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      if (String(req.originalUrl || '').startsWith('/api/')) {
        return res.status(429).json({ error: message });
      }
      req.flash?.('error', message);
      return res.status(429).redirect(req.get('Referer') || '/auth/login');
    }

    return next();
  };
}

module.exports = { createRateLimiter };
