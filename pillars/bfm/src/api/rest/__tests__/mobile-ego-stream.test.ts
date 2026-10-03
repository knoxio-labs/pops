import { EventEmitter } from 'node:events';

import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requestOn } from '../../__tests__/test-http.js';
import { MOBILE_EGO_CHAT_STREAM_PATH } from '../../paths.js';
import { makeMobileEgoStreamRouter } from '../mobile-ego-stream.js';

import type { NextFunction, Request, Response } from 'express';

import type {
  MobileEgoStreamFrame,
  MobileEgoStreamBody,
} from '../../../contract/mobile-ego-schemas.js';
import type { EgoStreamClient } from '../../ego/stream-client.js';

const PATH = MOBILE_EGO_CHAT_STREAM_PATH;
const MESSAGE_BODY: MobileEgoStreamBody = { message: 'hello' };
const DONE_FRAME: MobileEgoStreamFrame = {
  type: 'done',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  parts: [{ type: 'text', text: 'hello' }],
};

function makeApp(egoStream: EgoStreamClient, egoHeartbeatMs?: number) {
  const app = express();
  app.use(express.json());
  app.use(makeMobileEgoStreamRouter({ egoStream, egoHeartbeatMs }));
  return app;
}

function post(app: ReturnType<typeof makeApp>, body: object) {
  return requestOn(app, (r) => r.post(PATH).send(body));
}

async function* fromFrames(frames: readonly MobileEgoStreamFrame[]) {
  yield* frames;
}

function dataFrame(frame: MobileEgoStreamFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('POST /mobile/ego/chat/stream', () => {
  it('answers invalid chat and resume bodies with the standard mobile error', async () => {
    let opened = 0;
    const app = makeApp({
      open: async () => {
        opened++;
        return { kind: 'ok', frames: fromFrames([]) };
      },
    });

    for (const body of [{ message: '' }, { resumeBatchId: 'batch-1' }]) {
      const response = await post(app, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'bfm.request.invalid' });
      expect(response.body).not.toHaveProperty('issues');
    }
    expect(opened).toBe(0);
  });

  it('passes a resume body to the client unchanged and relays its frames', async () => {
    const body: MobileEgoStreamBody = {
      conversationId: 'conversation-1',
      resumeBatchId: 'batch-1',
    };
    let receivedBody: MobileEgoStreamBody | undefined;
    const app = makeApp({
      open: async (input) => {
        receivedBody = input.body;
        return { kind: 'ok', frames: fromFrames([DONE_FRAME]) };
      },
    });

    const response = await post(app, body);

    expect(receivedBody).toEqual(body);
    expect(response.status).toBe(200);
    expect(response.text).toBe(dataFrame(DONE_FRAME));
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  it('writes token, part, and done frames as ordered SSE data events', async () => {
    const frames: MobileEgoStreamFrame[] = [
      { type: 'token', text: 'hello' },
      { type: 'part', part: { type: 'text', text: 'hello' } },
      DONE_FRAME,
    ];
    let signal: AbortSignal | undefined;
    const app = makeApp({
      open: async (input) => {
        signal = input.signal;
        return { kind: 'ok', frames: fromFrames(frames) };
      },
    });

    const response = await post(app, MESSAGE_BODY);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers.connection).toBe('keep-alive');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.text).toBe(frames.map(dataFrame).join(''));
    expect(signal?.aborted).toBe(false);
  });

  it.each([
    { failure: { kind: 'unavailable', pillar: 'cerebrum', status: 503 }, status: 503 },
    { failure: { kind: 'contract-mismatch', pillar: 'cerebrum', status: 502 }, status: 502 },
  ] as const)(
    'maps an upstream $failure.kind failure before opening SSE headers',
    async ({ failure, status }) => {
      const app = makeApp({ open: async () => failure });

      const response = await post(app, MESSAGE_BODY);

      expect(response.status).toBe(status);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-type']).not.toContain('text/event-stream');
    }
  );

  it('sends keep-alive comments while a stream is idle', async () => {
    async function* delayedDone() {
      await wait(50);
      yield DONE_FRAME;
    }
    const app = makeApp({ open: async () => ({ kind: 'ok', frames: delayedDone() }) }, 10);

    const response = await post(app, MESSAGE_BODY);

    const heartbeatAt = response.text.indexOf(': keep-alive');
    const doneAt = response.text.indexOf(dataFrame(DONE_FRAME));
    expect(heartbeatAt).toBeGreaterThanOrEqual(0);
    expect(heartbeatAt).toBeLessThan(doneAt);
  });

  it('keeps a resumed tool turn open, heartbeats between frames, and relays through done', async () => {
    const frames: MobileEgoStreamFrame[] = [
      { type: 'tool', name: 'write', status: 'started' },
      { type: 'tool', name: 'write', status: 'finished' },
      {
        type: 'part',
        part: {
          type: 'actions',
          batchId: 'batch-1',
          actions: [
            { actionId: 'action-1', tool: 'write', summary: 'Saved item', status: 'executed' },
          ],
        },
      },
      { type: 'token', text: 'Saved.' },
      DONE_FRAME,
    ];
    let completed = false;
    async function* resumedFrames() {
      for (const [index, frame] of frames.entries()) {
        if (index > 0) await wait(30);
        if (frame.type === 'done') completed = true;
        yield frame;
      }
    }
    const app = makeApp({ open: async () => ({ kind: 'ok', frames: resumedFrames() }) }, 10);
    const body: MobileEgoStreamBody = {
      conversationId: 'conversation-1',
      resumeBatchId: 'batch-1',
    };

    const response = await post(app, body);

    const positions = frames.map((frame) => response.text.indexOf(dataFrame(frame)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].toSorted((left, right) => left - right));
    const heartbeatAt = response.text.indexOf(': keep-alive', positions[0] ?? 0);
    expect(heartbeatAt).toBeGreaterThan(positions[0] ?? -1);
    expect(heartbeatAt).toBeLessThan(positions[1] ?? Infinity);
    expect(completed).toBe(true);
  });

  it('writes a retryable cut-short frame after an iterable throws', async () => {
    async function* brokenFrames() {
      yield { type: 'token', text: 'partial' } as const;
      throw new Error('upstream failure detail must not reach the phone');
    }
    const app = makeApp({ open: async () => ({ kind: 'ok', frames: brokenFrames() }) });
    const cutShort: MobileEgoStreamFrame = {
      type: 'error',
      message: 'The reply was cut short.',
      retryable: true,
    };

    const response = await post(app, MESSAGE_BODY);

    expect(response.text).toBe(dataFrame({ type: 'token', text: 'partial' }) + dataFrame(cutShort));
  });

  it('does not abort the upstream signal when a stream completes normally', async () => {
    let signal: AbortSignal | undefined;
    const app = makeApp({
      open: async (input) => {
        signal = input.signal;
        return { kind: 'ok', frames: fromFrames([DONE_FRAME]) };
      },
    });

    await post(app, MESSAGE_BODY);

    expect(signal?.aborted).toBe(false);
  });

  it('aborts the upstream signal when the request closes before the response ends', async () => {
    type OpenResult = Awaited<ReturnType<EgoStreamClient['open']>>;
    let resolveOpen: ((result: OpenResult) => void) | undefined;
    let signal: AbortSignal | undefined;
    const pending = new Promise<OpenResult>((resolve) => {
      resolveOpen = resolve;
    });
    const egoStream: EgoStreamClient = {
      open: ({ signal: receivedSignal }) => {
        signal = receivedSignal;
        return pending;
      },
    };
    const router = makeMobileEgoStreamRouter({ egoStream });
    const route = (
      router as unknown as {
        stack: Array<{ route?: { path?: string; stack?: Array<{ handle: unknown }> } }>;
      }
    ).stack.find((layer) => layer.route?.path === PATH)?.route;
    const handler = route?.stack?.[0]?.handle;
    if (typeof handler !== 'function') throw new Error('stream route handler was not registered');

    const request = Object.assign(new EventEmitter(), {
      body: MESSAGE_BODY,
      complete: true,
    }) as unknown as Request & { complete: boolean };
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as Response;
    const handle = handler as (req: Request, res: Response, next: NextFunction) => Promise<void>;
    const responsePromise = handle(request, response, vi.fn());

    expect(signal).toBeDefined();
    request.complete = false;
    request.emit('close');
    expect(signal?.aborted).toBe(true);

    resolveOpen?.({ kind: 'ok', frames: fromFrames([]) });
    await responsePromise;
  });
});
