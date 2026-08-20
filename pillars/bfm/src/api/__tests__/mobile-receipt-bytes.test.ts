/**
 * The two mobile routes that hand a handset the bytes behind a receipt's
 * `pops://` URI, end to end through the real app, the real perimeter, the real
 * gateway and the real wire validation — with only purchases' network replaced.
 *
 * What is being defended here is mostly NOT the happy path, which is a
 * pass-through and would pass against almost any implementation:
 *
 *   - **The picture is the picture.** bfm re-encodes nothing. `purchases`
 *     named the file after the SHA-256 of what it holds, so a byte the proxy
 *     changed is a hash the caller can no longer verify — and nothing about a
 *     successful response would show it.
 *   - **A URI is not a bearer token.** Both routes declare
 *     `purchases.receipts.read`, and a handset whose grant covers the ORDER
 *     surface must still be refused the photograph of the paper. That is the
 *     entire point of giving the bytes their own capability (ADR-048), and it
 *     is invisible unless a test holds a grant that stops one short of it.
 *   - **Absent is absent.** A receipt whose file is not on the volume is a
 *     404 about the user's own data, not a 502 and not an empty 200.
 *   - **415 survives the crossing.** A receipt that cannot be rendered as an
 *     image is settled, not transient. Folded into the `invalid-request`
 *     bucket it would arrive as `upstream_invalid_request` — "this pillar
 *     built a bad request" — and the app would go on asking forever for a
 *     picture that cannot exist. The full-size route is the mirror case: it
 *     asked for no representation, so a 415 there is a contract fault and must
 *     NOT reach the phone as a status its generated client has no case for.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  MOBILE_SESSION_CAPABILITY,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import {
  MobileReceiptBytesSchema,
  MobileUpstreamErrorSchema,
} from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { createTestApp, type TestApp } from './harness.js';
import { createReceiptBytesFake, type ReceiptBytesFake } from './receipt-bytes-fake.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

/** A plausible content address. Synthetic; nothing was hashed to produce it. */
const SHA = '6dd4f1c6c5b4c0f3a2e1d0c9b8a796857463524130fedcba9876543210abcdef';

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

interface Paired {
  app: Express;
  token: string;
  fake: ReceiptBytesFake;
}

function open(
  answers: { read?: CallResult<unknown>; thumbnail?: CallResult<unknown> },
  capabilities: readonly string[] = DEFAULT_DEVICE_CAPABILITIES
): Paired {
  const fake = createReceiptBytesFake(answers);
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(fake.factory)),
  });
  apps.push(created);

  const row = deviceRow({ capabilities: serialiseDeviceCapabilities(capabilities) });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token, fake };
}

function get(app: Express, token: string, path: string) {
  return requestOn(app, (r) => r.get(path).set('Authorization', `Bearer ${token}`));
}

function full(sha = SHA): string {
  return `/mobile/purchases/receipts/${sha}`;
}

function thumb(sha = SHA): string {
  return `/mobile/purchases/receipts/${sha}/thumbnail`;
}

/** The producer's 200 body for either byte route. */
function bytes(overrides: Partial<Record<string, unknown>> = {}): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      sha256: SHA,
      mediaType: 'image/jpeg',
      byteLength: 9,
      dataBase64: 'aGVsbG8tanBn',
      ...overrides,
    },
  };
}

describe('the full-size receipt', () => {
  it('hands back exactly what purchases answered, byte for byte', async () => {
    const { app, token } = open({ read: bytes() });

    const res = await get(app, token, full());

    expect(res.status).toBe(200);
    expect(MobileReceiptBytesSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toEqual({
      sha256: SHA,
      mediaType: 'image/jpeg',
      byteLength: 9,
      dataBase64: 'aGVsbG8tanBn',
    });
  });

  it('asks the producer for the hash in the path and nothing else', async () => {
    const other = 'a'.repeat(64);
    const { app, token, fake } = open({ read: bytes({ sha256: other }) });

    await get(app, token, full(other));

    expect(fake.reads).toEqual([{ sha256: other }]);
    expect(fake.thumbnails).toEqual([]);
  });

  it('answers 404 when the bytes are not on the volume', async () => {
    const { app, token } = open({
      read: { kind: 'not-found', pillar: 'purchases', message: 'No receipt is stored under …' },
    });

    const res = await get(app, token, full());

    expect(res.status).toBe(404);
    expect(MobileUpstreamErrorSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.code).toBe('not_found');
    expect(res.body.retryable).toBe(false);
  });

  it('does not name a transaction when the missing thing is a receipt', async () => {
    // The 404 summary used to be hardcoded to "No such transaction", which
    // sends whoever reads the crash report to the wrong pillar entirely.
    const { app, token } = open({
      read: { kind: 'not-found', pillar: 'purchases', message: 'absent' },
    });

    const res = await get(app, token, full());

    expect(res.body.message).not.toContain('transaction');
    expect(res.body.message).toContain('purchases');
  });

  it('folds a producer 415 into a 502, because this route asked for no representation', async () => {
    // The mirror of the thumbnail case below. This route asked for the receipt
    // as it is STORED, so there is no form for the producer to refuse — a 415
    // here is a contract fault, and letting it through would put a status on
    // the wire that this route's OpenAPI document, and therefore the generated
    // Swift client, has no case for.
    const { app, token } = open({
      read: { kind: 'refused', pillar: 'purchases', status: 415, message: 'not an image' },
    });

    const res = await get(app, token, full());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
    expect(res.body.retryable).toBe(false);
  });

  it('answers 503 and asks the phone to try again when purchases is down', async () => {
    const { app, token } = open({ read: { kind: 'unavailable', pillar: 'purchases' } });

    const res = await get(app, token, full());

    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
  });

  it('is a 502 rather than a 401 when purchases rejects bfm’s own credential', async () => {
    // The phone's token is fine. A 401 here sends it into a refresh loop
    // against a fault only an operator can fix.
    const { app, token } = open({
      read: { kind: 'unauthorized', pillar: 'purchases', message: 'scope purchases.receipt' },
    });

    const res = await get(app, token, full());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_misconfigured');
  });

  it('refuses a producer body with an empty payload rather than drawing nothing', async () => {
    // A well-formed envelope carrying no bytes reaches a handset as an image
    // view that renders blank, which reads as a broken photograph rather than
    // as a broken wire.
    const { app, token } = open({ read: bytes({ dataBase64: '' }) });

    const res = await get(app, token, full());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });
});

describe('the thumbnail', () => {
  it('answers the same envelope shape as the full-size route', async () => {
    const { app, token } = open({
      thumbnail: bytes({ byteLength: 12, dataBase64: 'dGh1bWJuYWls' }),
    });

    const res = await get(app, token, thumb());

    expect(res.status).toBe(200);
    expect(MobileReceiptBytesSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.dataBase64).toBe('dGh1bWJuYWls');
  });

  it('calls the producer’s thumbnail route, not its full-size one', async () => {
    const { app, token, fake } = open({ thumbnail: bytes() });

    await get(app, token, thumb());

    expect(fake.thumbnails).toEqual([{ sha256: SHA }]);
    expect(fake.reads).toEqual([]);
  });

  it('passes a producer 415 through as 415, settled and not retryable', async () => {
    const { app, token } = open({
      thumbnail: {
        kind: 'refused',
        pillar: 'purchases',
        status: 415,
        message: 'RECEIPT_NOT_AN_IMAGE',
      },
    });

    const res = await get(app, token, thumb());

    expect(res.status).toBe(415);
    expect(MobileUpstreamErrorSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.code).toBe('upstream_unsupported_media');
    expect(res.body.retryable).toBe(false);
  });

  it('keeps the producer’s own reason in the operator-facing message', async () => {
    const { app, token } = open({
      thumbnail: {
        kind: 'refused',
        pillar: 'purchases',
        status: 415,
        message: 'RECEIPT_UNDECODABLE',
      },
    });

    const res = await get(app, token, thumb());

    expect(res.body.message).toContain('RECEIPT_UNDECODABLE');
  });

  it('still answers 404 for a receipt that is not stored at all', async () => {
    const { app, token } = open({
      thumbnail: { kind: 'not-found', pillar: 'purchases', message: 'absent' },
    });

    const res = await get(app, token, thumb());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('does not fold a non-415 producer refusal into 415', async () => {
    // 413 and 422 share the SDK's `refused` bucket with 415. Only 415 says
    // something about the resource; the rest are about the request bfm built.
    const { app, token } = open({
      thumbnail: { kind: 'refused', pillar: 'purchases', status: 422, message: 'unprocessable' },
    });

    const res = await get(app, token, thumb());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_invalid_request');
  });
});

describe('a URI is not a bearer token', () => {
  it('refuses a handset that may read orders but was not granted the receipt bytes', async () => {
    const { app, token, fake } = open({ read: bytes() }, [
      MOBILE_SESSION_CAPABILITY,
      'purchases.read',
    ]);

    const res = await get(app, token, full());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      code: 'capability_not_granted',
      message: expect.any(String),
      capability: 'purchases.receipts.read',
    });
    // The refusal happened at the perimeter, so purchases was never asked —
    // a gate that answered 403 after fetching the bytes would still have
    // moved personal data across the seam.
    expect(fake.reads).toEqual([]);
  });

  it('refuses the thumbnail on the same terms', async () => {
    const { app, token, fake } = open({ thumbnail: bytes() }, [
      MOBILE_SESSION_CAPABILITY,
      'purchases.read',
    ]);

    const res = await get(app, token, thumb());

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('purchases.receipts.read');
    expect(fake.thumbnails).toEqual([]);
  });

  it('does not let the receipt-write grant buy a read', async () => {
    // Photographing a till slip and being handed back every receipt the
    // household has ever stored are different authorities.
    const { app, token } = open({ read: bytes() }, [
      MOBILE_SESSION_CAPABILITY,
      'purchases.receipts.write',
    ]);

    const res = await get(app, token, full());

    expect(res.status).toBe(403);
  });

  it('refuses a caller with no token at all, before any capability question', async () => {
    const { app, fake } = open({ read: bytes() });

    const res = await requestOn(app, (r) => r.get(full()));

    expect(res.status).toBe(401);
    expect(fake.reads).toEqual([]);
  });

  it('refuses a token this pillar did not mint', async () => {
    const { app, fake } = open({ read: bytes() });

    const res = await requestOn(app, (r) =>
      r.get(full()).set('Authorization', 'Bearer not-a-token-this-pillar-issued')
    );

    expect(res.status).toBe(401);
    expect(fake.reads).toEqual([]);
  });
});
