/**
 * The mounted `/jobs` surface, driven through the real express app.
 *
 * This pillar ships with no Redis by default, so what these cases pin is the
 * degraded answer: the routes EXIST and say 503 — a caller can tell "this
 * pillar cannot manage jobs right now" apart from "this pillar has no such
 * endpoint", which is exactly what an aggregator fanning out across pillars
 * needs.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { closeAiMaintenanceQueues } from '../jobs/queue.js';
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-jobs-rest-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  delete process.env['REDIS_URL'];
  delete process.env['REDIS_HOST'];
  await closeAiMaintenanceQueues();
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(async () => {
  await closeAiMaintenanceQueues();
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('the /jobs surface with no Redis configured', () => {
  it('answers 503 on every read rather than 404 or an empty healthy queue', async () => {
    for (const path of ['/jobs', '/jobs/stats', '/jobs/queues', '/jobs/dead-letter']) {
      const res = await requestOn(app).get(path);
      expect(res.status, path).toBe(503);
      expect(res.body).toMatchObject({ code: 'ServiceUnavailableError' });
    }
  });

  it('answers 503 on every mutation too', async () => {
    const drain = await requestOn(app).post('/jobs/drain').send({});
    expect(drain.status).toBe(503);

    const retry = await requestOn(app).post('/jobs/abc/retry').send({});
    expect(retry.status).toBe(503);

    const cancel = await requestOn(app).post('/jobs/abc/cancel').send({});
    expect(cancel.status).toBe(503);

    const replay = await requestOn(app).post('/jobs/dead-letter/abc/replay').send({});
    expect(replay.status).toBe(503);
  });

  it('routes the literal paths ahead of /jobs/:id — /jobs/stats is not a job id', async () => {
    // Both 503 here, so the discriminator is the error the route reached:
    // `/jobs/stats` must not be answered by the single-job read.
    const stats = await requestOn(app).get('/jobs/stats');
    const single = await requestOn(app).get('/jobs/some-job-id');

    expect(stats.status).toBe(503);
    expect(single.status).toBe(503);
    expect(stats.body).toMatchObject({ message: expect.stringContaining('no Redis') });
  });

  it('rejects a list window the contract caps, before it ever reaches Redis', async () => {
    const res = await requestOn(app).get('/jobs').query({ limit: '500' });

    expect(res.status).toBe(400);
  });
});
