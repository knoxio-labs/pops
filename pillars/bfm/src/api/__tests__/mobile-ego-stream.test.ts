import { afterEach, describe, expect, it } from 'vitest';

import { serialiseDeviceCapabilities, type MobileCapability } from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type {
  MobileEgoStreamBody,
  MobileEgoStreamFrame,
} from '../../contract/mobile-ego-schemas.js';
import type { EgoStreamClient } from '../ego/stream-client.js';

const PATH = '/mobile/ego/chat/stream';
const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(
  egoStream: EgoStreamClient | undefined,
  capabilities: readonly MobileCapability[] = ['ego.chat']
): { app: Express; token: string } {
  const created = createTestApp(egoStream === undefined ? {} : { egoStream });
  apps.push(created);
  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);
  return { app: created.app, token };
}

function post(app: Express, token: string | null, body: object) {
  return requestOn(app, (r) => {
    const request = r.post(PATH);
    if (token !== null) request.set('Authorization', `Bearer ${token}`);
    return request.send(body);
  });
}

async function* fromFrames(frames: readonly MobileEgoStreamFrame[]) {
  yield* frames;
}

function dataFrame(frame: MobileEgoStreamFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

describe('the mounted mobile Ego stream', () => {
  it('requires a device token before opening the upstream stream', async () => {
    let opened = false;
    const { app } = openWith({
      open: async () => {
        opened = true;
        return { kind: 'unavailable', pillar: 'cerebrum', status: 503 };
      },
    });

    const response = await post(app, null, { message: 'hello' });

    expect(response.status).toBe(401);
    expect(opened).toBe(false);
  });

  it('requires ego.chat before opening the upstream stream', async () => {
    let opened = false;
    const { app, token } = openWith(
      {
        open: async () => {
          opened = true;
          return { kind: 'unavailable', pillar: 'cerebrum', status: 503 };
        },
      },
      ['session.read']
    );

    const response = await post(app, token, { message: 'hello' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'capability_not_granted',
      capability: 'ego.chat',
    });
    expect(opened).toBe(false);
  });

  it('validates chat and resume bodies before opening the stream', async () => {
    let opened = 0;
    const { app, token } = openWith({
      open: async () => {
        opened++;
        return { kind: 'unavailable', pillar: 'cerebrum', status: 503 };
      },
    });

    for (const body of [{ message: '' }, { resumeBatchId: 'batch-1' }]) {
      const response = await post(app, token, body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'bfm.request.invalid' });
    }
    expect(opened).toBe(0);
  });

  it('forwards resume bodies unchanged and relays frames in order', async () => {
    const body: MobileEgoStreamBody = {
      conversationId: 'conversation-1',
      resumeBatchId: 'batch-1',
    };
    const frames: MobileEgoStreamFrame[] = [
      { type: 'tool', name: 'inventory.items.move', status: 'finished' },
      { type: 'token', text: 'Moved the item.' },
      {
        type: 'done',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        parts: [{ type: 'text', text: 'Moved the item.' }],
      },
    ];
    const received: MobileEgoStreamBody[] = [];
    const { app, token } = openWith({
      open: async (input) => {
        received.push(input.body);
        return { kind: 'ok', frames: fromFrames(frames) };
      },
    });

    const response = await post(app, token, body);

    expect(received).toEqual([body]);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toBe(frames.map(dataFrame).join(''));
  });

  it('uses an offline default stream client that returns JSON 503', async () => {
    const { app, token } = openWith(undefined);

    const response = await post(app, token, { message: 'hello' });

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('charges the stream budget before verifying a token', async () => {
    const { app } = openWith({
      open: async () => ({ kind: 'unavailable', pillar: 'cerebrum', status: 503 }),
    });
    const statuses: number[] = [];

    for (let turn = 0; turn < 13; turn++) {
      statuses.push((await post(app, null, { message: 'hello' })).status);
    }

    expect(statuses.slice(0, 12)).toEqual(Array.from({ length: 12 }, () => 401));
    expect(statuses.at(-1)).toBe(429);
  });

  it('keeps the event stream out of the generated OpenAPI routes', async () => {
    const created = createTestApp();
    apps.push(created);
    const { app } = created;
    const response = await requestOn(app, (r) => r.get('/openapi'));

    expect(response.status).toBe(200);
    expect(
      Object.keys(response.body.paths as Record<string, unknown>).some((path) =>
        path.includes('/mobile/ego/chat')
      )
    ).toBe(false);
  });
});
