/**
 * A malformed or non-object JSON body, over the real app.
 *
 * `express.json()` runs in strict mode: it throws on a body that is not valid
 * JSON at all, and on a body that IS valid JSON but not an object or array at
 * the top level (a bare string, number, `true`, `false` or `null`). Left
 * alone, both throws reach Express's default handler, which answers a `400`
 * with an EMPTY body — not the `invalid_request` shape these routes declare,
 * which is what `rest/json-body-error.ts` exists to fix (POPS-1539).
 *
 * One device-facing route (`/devices/challenge`, unauthenticated by design)
 * and one `/mobile/*` route (the receipt upload, which needs a paired
 * device) — the two surfaces `rest/invalid-request-scope.ts` draws the same
 * line around. A JSON *array* body is deliberately not exercised here: it is
 * valid at the top level, so it reaches ts-rest rather than body-parser, and
 * `device-refresh.test.ts` already covers that path through
 * `request-validation.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DeviceInvalidRequestErrorSchema,
  RefreshChallengeSchema,
} from '../../contract/rest-device-schemas.js';
import { MobileRequestErrorSchema } from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { CHALLENGE_PATH } from '../app.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

const UPLOAD_PATH = '/mobile/purchases/receipts';

const apps: TestApp[] = [];

function open(): TestApp {
  const created = createTestApp();
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

/** A token for a device that is allowed in, so the request reaches the body parser at all. */
function tokenFor(app: TestApp): string {
  const row = deviceRow();
  app.db.insert(devices).values(row).run();
  return mintAccessToken(row.id, app.accessTokenSigningKey).token;
}

const NON_OBJECT_BODIES: readonly (readonly [string, string])[] = [
  ['malformed JSON', '{"nonce": '],
  ['a bare string', '"just a string"'],
  ['a bare number', '42'],
];

describe('a device-facing route (POST /devices/challenge)', () => {
  it.each(NON_OBJECT_BODIES)(
    'answers the declared 400 rather than an empty body: %s',
    async (_label, raw) => {
      const app = open();

      const res = await requestOn(app.app, (r) =>
        r.post(CHALLENGE_PATH).set('content-type', 'application/json').send(raw)
      );

      expect(res.status).toBe(400);
      expect(res.body).not.toEqual({});
      expect(DeviceInvalidRequestErrorSchema.parse(res.body).code).toBe('invalid_request');
    }
  );

  it('still mints a nonce for a well-formed body', async () => {
    const app = open();

    const res = await requestOn(app.app, (r) => r.post(CHALLENGE_PATH).send({}));

    expect(res.status).toBe(201);
    expect(RefreshChallengeSchema.parse(res.body).nonce).not.toBe('');
  });
});

describe('a /mobile route (POST /mobile/purchases/receipts)', () => {
  it.each(NON_OBJECT_BODIES)(
    'answers the declared 400 rather than an empty body: %s',
    async (_label, raw) => {
      const app = open();
      const token = tokenFor(app);

      const res = await requestOn(app.app, (r) =>
        r
          .post(UPLOAD_PATH)
          .set('Authorization', `Bearer ${token}`)
          .set('content-type', 'application/json')
          .send(raw)
      );

      expect(res.status).toBe(400);
      expect(res.body).not.toEqual({});
      expect(MobileRequestErrorSchema.parse(res.body).code).toBe('invalid_request');
    }
  );

  it('is unreachable without a device — the guard runs ahead of the body parser', async () => {
    const app = open();

    const res = await requestOn(app.app, (r) =>
      r.post(UPLOAD_PATH).set('content-type', 'application/json').send('"just a string"')
    );

    expect(res.status).toBe(401);
  });
});
