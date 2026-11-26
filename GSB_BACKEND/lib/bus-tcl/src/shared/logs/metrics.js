// Métriques temps réel en mémoire sur TOUTES les requêtes HTTP, y compris celles
// qui ne sont pas journalisées (la vue SQL, elle, ne voit que les requêtes stockées).
//  - compteurs EXACTS par tranches de 10 s (aucune limite de volume)
//  - latences : percentiles calculés sur les 2000 dernières requêtes de la fenêtre

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)] * 100) / 100;
}

const round2 = (n) => Math.round(n * 100) / 100;

function emptyBucket(start) {
  return {
    start, total: 0, logged: 0, errors5xx: 0, errors4xx: 0, authFailures: 0,
    rateLimited: 0, slow: 0, aborted: 0, durationSum: 0, durationMax: 0,
  };
}

export function createMetrics({ windowMs = 5 * 60 * 1000, bucketMs = 10 * 1000, maxSamples = 2000 } = {}) {
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 5 * 60 * 1000;
  const safeBucketMs = Number.isFinite(bucketMs) && bucketMs > 0 ? Math.min(bucketMs, safeWindowMs) : 10 * 1000;
  const safeMaxSamples = Number.isInteger(maxSamples) && maxSamples >= 0 ? maxSamples : 2000;

  let buckets = [];
  let samples = []; // anneau circulaire de { ts, d }
  let sampleIdx = 0;
  const counters = {
    flushes_ok: 0, flushes_failed: 0, retries: 0, timeouts: 0,
    dropped: 0, fallback: 0, internal_errors: 0, alerts_suppressed: 0,
  };

  function prune(now) {
    const cutoff = now - safeWindowMs;
    while (buckets.length && buckets[0].start + safeBucketMs <= cutoff) buckets.shift();
  }

  function currentBucket(now) {
    const start = now - (now % safeBucketMs);
    let b = buckets[buckets.length - 1];
    if (!b || b.start !== start) {
      b = emptyBucket(start);
      buckets.push(b);
    }
    return b;
  }

  function recordRequest({ status = 0, duration_ms, logged, reason, aborted }) {
    const now = Date.now();
    prune(now);
    const d = typeof duration_ms === "number" ? duration_ms : 0;
    const b = currentBucket(now);
    b.total++;
    if (logged) b.logged++;
    if (status >= 500) b.errors5xx++;
    else if (status >= 400 && status !== 499) b.errors4xx++;
    if (status === 401 || status === 403) b.authFailures++;
    if (status === 429) b.rateLimited++;
    if (reason === "slow_request") b.slow++;
    if (aborted) b.aborted++;
    b.durationSum += d;
    if (d > b.durationMax) b.durationMax = d;

    if (safeMaxSamples > 0) {
      if (samples.length < safeMaxSamples) samples.push({ ts: now, d });
      else {
        samples[sampleIdx] = { ts: now, d };
        sampleIdx = (sampleIdx + 1) % safeMaxSamples;
      }
    }
  }

  function snapshot({ pending = 0, in_flight = 0 } = {}) {
    const now = Date.now();
    prune(now);

    const t = emptyBucket(0);
    for (const b of buckets) {
      t.total += b.total;
      t.logged += b.logged;
      t.errors5xx += b.errors5xx;
      t.errors4xx += b.errors4xx;
      t.authFailures += b.authFailures;
      t.rateLimited += b.rateLimited;
      t.slow += b.slow;
      t.aborted += b.aborted;
      t.durationSum += b.durationSum;
      if (b.durationMax > t.durationMax) t.durationMax = b.durationMax;
    }

    const cutoff = now - safeWindowMs - safeBucketMs;
    const durations = samples.filter((s) => s.ts >= cutoff).map((s) => s.d).sort((a, b) => a - b);

    return {
      window_ms: safeWindowMs,
      requests_total: t.total,
      requests_logged: t.logged,
      requests_ignored: t.total - t.logged,
      errors_5xx: t.errors5xx,
      errors_4xx: t.errors4xx,
      auth_failures: t.authFailures,
      rate_limited: t.rateLimited,
      slow_requests: t.slow,
      aborted_requests: t.aborted,
      error_rate_5xx: t.total ? Math.round((t.errors5xx / t.total) * 10000) / 10000 : 0,
      latency_ms: {
        avg: t.total ? round2(t.durationSum / t.total) : 0,
        max: round2(t.durationMax),
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        sample_size: durations.length,
      },
      buffer: { pending, in_flight, ...counters },
    };
  }

  function reset() {
    buckets = [];
    samples = [];
    sampleIdx = 0;
    for (const key of Object.keys(counters)) counters[key] = 0;
  }

  return { recordRequest, snapshot, reset, counters };
}
