/**
 * Up Bank webhook ingest route for the finance pillar.
 *
 * Raw Express route — deliberately NOT a ts-rest contract route — because Up
 * signs the exact request bytes (`X-Up-Authenticity-Signature` is the
 * HMAC-SHA256 of the raw body), so the handler must read the unparsed Buffer.
 * The app factory registers a path-scoped `express.raw()` ahead of the global
 * `express.json()` for this reason (see `app.ts`).
 *
 * The endpoint bypasses gateway auth by design (Cloudflare Access excludes the
 * Up webhook path); authenticity is established by the signature check alone.
 *
 * Explicit no-op: the handler verifies the signature and acknowledges every
 * event with `200`, as Up requires, but does not fetch or persist the
 * transaction — batch + webhook persistence is tracked in full at
 * `docs/ideas/up-bank-api-import.md` and knoxio/pops#1874. Ingestion staying
 * silent is surfaced separately via the `import` staleness fields on
 * `GET /health` (see `handlers.ts`), not by this route.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { type Router as ExpressRouter, Router } from 'express';

function getWebhookSecret(): string {
  const filePath = process.env['UP_WEBHOOK_SECRET_FILE'];
  if (filePath) {
    return readFileSync(filePath, 'utf-8').trim();
  }
  const envVal = process.env['UP_WEBHOOK_SECRET'];
  if (envVal) return envVal;
  throw new Error('Missing UP_WEBHOOK_SECRET_FILE or UP_WEBHOOK_SECRET');
}

function verifySignature(body: Buffer, signature: string): boolean {
  const secret = getWebhookSecret();
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/**
 * Build the Up Bank webhook router. Two POST routes:
 * - `/webhooks/up` — signature-verified transaction event receiver.
 * - `/webhooks/up/ping` — endpoint liveness probe Up calls on setup.
 */
export function createUpBankWebhookRouter(): ExpressRouter {
  const router = Router();

  router.post('/webhooks/up', (req, res) => {
    const signature = req.headers['x-up-authenticity-signature'];
    if (typeof signature !== 'string') {
      res.status(401).json({ error: 'Missing signature header' });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!verifySignature(rawBody, signature)) {
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as {
      data?: {
        attributes?: { eventType?: string };
        relationships?: { transaction?: { data?: { id?: string } } };
      };
    };

    const eventType = payload.data?.attributes?.eventType;
    const transactionId = payload.data?.relationships?.transaction?.data?.id;

    console.warn(
      `[webhook/up] no-op (tracked: knoxio/pops#1874) — event=${eventType} transaction=${transactionId}`
    );

    res.status(200).json({ received: true });
  });

  router.post('/webhooks/up/ping', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return router;
}
