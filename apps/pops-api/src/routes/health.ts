import { sql } from 'drizzle-orm';
import { type Router as ExpressRouter, Router } from 'express';

import { getDrizzle } from '../db.js';
import { getRedisStatus } from '../redis.js';

const router: ExpressRouter = Router();

const apiVersion =
  process.env.BUILD_VERSION && process.env.BUILD_VERSION !== 'dev'
    ? `a${process.env.BUILD_VERSION}`
    : 'dev';

router.get('/health', (_req, res) => {
  try {
    const db = getDrizzle();
    const rows = db.all<{ ok: number }>(sql`SELECT 1 AS ok`);
    if (rows[0]?.ok === 1) {
      const redisStatus = getRedisStatus();
      res.json({
        status: 'ok',
        version: apiVersion,
        redis: redisStatus === 'ready' ? 'ok' : 'down',
      });
    } else {
      res.status(503).json({ status: 'unhealthy', reason: 'sqlite check failed' });
    }
  } catch {
    res.status(503).json({ status: 'unhealthy', reason: 'database unreachable' });
  }
});

export default router;
