// Tampon asynchrone par lots : 1 lot en vol à la fois, délai max (AbortSignal),
// réessais avec backoff exponentiel, plafond mémoire et repli sur stderr à l'arrêt.

function sleep(ms, keepAlive = false) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (!keepAlive) t.unref?.();
  });
}

function defaultFallback(entries, reason) {
  for (const entry of entries) {
    process.stderr.write(`${JSON.stringify({ log_bus_fallback: reason, ...entry })}\n`);
  }
}

export function createLogBuffer({ storage, cfg, counters, emit }) {
  let queue = [];
  let inFlightBatch = null;
  let currentFlush = null;
  let retryNotBefore = 0;
  let shuttingDown = false;
  let closed = false;
  let shutdownPromise = null;

  const totalPending = () => queue.length + (inFlightBatch ? inFlightBatch.length : 0);

  function drop(count, reason) {
    if (count <= 0) return;
    counters.dropped += count;
    emit("dropped", count, reason);
  }

  function sendToFallback(entries, reason) {
    if (!entries.length) return;
    counters.fallback += entries.length;
    try {
      (cfg.fallback || defaultFallback)(entries, reason);
    } catch (err) {
      counters.internal_errors++;
      emit("internal_error", err);
    }
    emit("fallback", entries.length, reason);
  }

  function trimOverflow() {
    const overflow = Math.min(totalPending() - cfg.maxBufferSize, queue.length);
    if (overflow <= 0) return;
    queue.splice(0, overflow);
    drop(overflow, "buffer_overflow");
  }

  async function insertOnce(batch) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        counters.timeouts++;
        reject(new Error(`Log Bus : écriture abandonnée après ${cfg.insertTimeoutMs} ms`));
      }, cfg.insertTimeoutMs);
    });
    try {
      await Promise.race([
        Promise.resolve().then(() => storage.insertMany(batch, { signal: controller.signal })),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function insertWithRetry(batch) {
    const maxAttempts = Math.max(1, (cfg.maxRetries ?? 0) + 1);
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await insertOnce(batch);
        counters.flushes_ok++;
        return true;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          counters.retries++;
          await sleep((cfg.retryBaseDelayMs ?? 500) * 2 ** (attempt - 1), shuttingDown);
        }
      }
    }
    counters.flushes_failed++;
    emit("storage_error", lastError, batch.length);
    return false;
  }

  function flushOnce() {
    if (currentFlush) return currentFlush;
    if (!queue.length) return Promise.resolve();
    const batch = queue;
    queue = [];
    inFlightBatch = batch;

    currentFlush = (async () => {
      const ok = await insertWithRetry(batch);
      if (inFlightBatch === batch) inFlightBatch = null;
      if (ok || batch.handedOff) return;
      if (shuttingDown || closed) {
        sendToFallback(batch, "shutdown_storage_failure");
        return;
      }
      // Échec temporaire : on remet le lot en tête dans la limite de maxBufferSize
      retryNotBefore = Date.now() + cfg.flushIntervalMs;
      const room = Math.max(0, cfg.maxBufferSize - queue.length);
      const kept = batch.slice(Math.max(0, batch.length - room));
      queue.unshift(...kept);
      drop(batch.length - kept.length, "storage_failure");
    })()
      .catch((err) => {
        counters.internal_errors++;
        emit("internal_error", err);
      })
      .finally(() => {
        currentFlush = null;
        if (!shuttingDown && queue.length >= cfg.batchSize && Date.now() >= retryNotBefore) flushOnce();
      });

    return currentFlush;
  }

  const timer = setInterval(() => { flushOnce(); }, cfg.flushIntervalMs);
  timer.unref?.();

  return {
    enqueue(entry) {
      if (closed) {
        sendToFallback([entry], "after_shutdown");
        return;
      }
      queue.push(entry);
      trimOverflow();
      if (queue.length >= cfg.batchSize && !currentFlush && Date.now() >= retryNotBefore) flushOnce();
    },

    async flush() {
      if (currentFlush) await currentFlush;
      await flushOnce();
    },

    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      clearInterval(timer);

      shutdownPromise = (async () => {
        const drain = (async () => {
          if (currentFlush) await currentFlush;
          await flushOnce();
          if (queue.length) await flushOnce();
        })();

        let deadline;
        const timedOut = await Promise.race([
          drain.then(() => false),
          new Promise((resolve) => { deadline = setTimeout(() => resolve(true), cfg.shutdownTimeoutMs); }),
        ]);
        clearTimeout(deadline);

        if (timedOut && inFlightBatch) {
          const stranded = inFlightBatch;
          stranded.handedOff = true;
          inFlightBatch = null;
          sendToFallback(stranded, "shutdown_timeout");
        }
        if (queue.length) {
          sendToFallback(queue, timedOut ? "shutdown_timeout" : "shutdown_late");
          queue = [];
        }
        closed = true;
      })();

      return shutdownPromise;
    },

    sizes: () => ({ pending: queue.length, in_flight: inFlightBatch ? inFlightBatch.length : 0 }),
  };
}
