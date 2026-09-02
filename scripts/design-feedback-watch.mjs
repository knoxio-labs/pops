#!/usr/bin/env node
/**
 * Block until a comment appears on the design playground, then exit.
 *
 * The event-driven half of the comment loop, and the same shape as
 * `gh run watch`: run it in the background, and when it exits the harness
 * re-invokes the session with the threads that woke it. A session polling
 * `list_threads` on a timer would burn a request per tick for hours.
 *
 * Usage: node scripts/design-feedback-watch.mjs [sinceISO]
 *   WATCH_INTERVAL_MS (default 5000)  — poll cadence.
 *   WATCH_MAX_MS      (default 1800000) — give up and exit so the watcher is
 *                     re-armed deliberately rather than running forever.
 */
import { createClient, latestStamp, threadsQuery } from './design-feedback.mjs';

/** @param {unknown} data */
function out(data) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

const client = createClient();
if ('error' in client) {
  out({ error: client.error });
  process.exit(1);
}

const since = process.argv[2] ?? new Date().toISOString();
const interval = Number(process.env.WATCH_INTERVAL_MS ?? 5000);
const maxMs = Number(process.env.WATCH_MAX_MS ?? 1_800_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startedAt = Date.now();
while (Date.now() - startedAt < maxMs) {
  const result = await client.call(threadsQuery({ status: 'open', since }));
  if (result && typeof result === 'object' && 'error' in result) {
    out(result);
    process.exit(1);
  }
  const threads = Array.isArray(result?.threads) ? result.threads : [];
  if (threads.length > 0) {
    out({
      changed: true,
      since,
      latest: latestStamp(threads, since),
      count: threads.length,
      threads,
    });
    process.exit(0);
  }
  await sleep(interval);
}

out({ changed: false, timedOut: true, since });
process.exit(0);
