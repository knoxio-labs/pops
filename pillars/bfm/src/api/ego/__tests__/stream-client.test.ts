import { describe, expect, it, vi } from 'vitest';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createEgoStreamClient } from '../stream-client.js';

import type { MobileEgoStreamBody } from '../../../contract/mobile-ego-schemas.js';
import type { EgoStreamClient } from '../stream-client.js';

const BASE_URL = 'https://cerebrum.test/';
const SERVICE_KEY = 'service-account-key';
const CHAT: MobileEgoStreamBody = { message: 'hello' };
const encoder = new TextEncoder();

function sseResponse(frames: readonly unknown[], contentType = 'text/event-stream'): Response {
  const body = frames.map((frame) => 'data: ' + JSON.stringify(frame) + '\n\n').join('');
  return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

function makeHarness(
  options: {
    readonly target?: { readonly baseUrl: string } | null;
    readonly key?: string | null;
    readonly response?: Response;
    readonly fetchFailure?: Error;
  } = {}
) {
  const target = options.target === null ? undefined : (options.target ?? { baseUrl: BASE_URL });
  const discovery = { lookup: vi.fn(async () => target) };
  const fetchImpl = vi.fn(
    async (
      _url: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      if (options.fetchFailure !== undefined) throw options.fetchFailure;
      return options.response ?? sseResponse([]);
    }
  );
  const apiKey = (): string | undefined =>
    options.key === null ? undefined : (options.key ?? SERVICE_KEY);
  return {
    client: createEgoStreamClient({ discovery, fetchImpl: fetchImpl as typeof fetch, apiKey }),
    discovery,
    fetchImpl,
  };
}

function open(
  client: EgoStreamClient,
  body: MobileEgoStreamBody = CHAT,
  signal: AbortSignal = new AbortController().signal
) {
  return client.open({ body, signal });
}

async function collect(result: Awaited<ReturnType<EgoStreamClient['open']>>) {
  if (result.kind !== 'ok') throw new Error('expected an Ego stream');
  const frames = [];
  for await (const frame of result.frames) frames.push(frame);
  return frames;
}

describe('createEgoStreamClient', () => {
  it('sends an authenticated shell request and maps known frames in order', async () => {
    const { client, fetchImpl } = makeHarness({
      response: sseResponse([
        { type: 'token', text: 'hello' },
        { type: 'part', part: { type: 'future_part' } },
        { type: 'part', part: { type: 'text', text: 'hello' } },
        {
          type: 'done',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          parts: [{ type: 'text', text: 'hello' }],
        },
        { type: 'token', text: 'ignored after done' },
      ]),
    });
    const controller = new AbortController();
    const result = await open(
      client,
      {
        message: 'hello',
        conversationId: 'conversation-1',
        appContext: { app: 'shell', uri: '/finance/budgets' },
      },
      controller.signal
    );
    await expect(collect(result)).resolves.toEqual([
      { type: 'token', text: 'hello' },
      { type: 'part', part: { type: 'text', text: 'hello' } },
      {
        type: 'done',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://cerebrum.test/ego/chat/stream');
    const headers = new Headers(init?.headers);
    expect(headers.get(SERVICE_ACCOUNT_HEADER)).toBe(SERVICE_KEY);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('text/event-stream');
    expect(init?.signal).toBe(controller.signal);
    expect(JSON.parse(String(init?.body))).toEqual({
      message: 'hello',
      conversationId: 'conversation-1',
      appContext: { app: 'shell', uri: '/finance/budgets' },
      channel: 'shell',
    });
  });

  it('sends resume bodies without a message key', async () => {
    const { client, fetchImpl } = makeHarness();
    await open(client, { conversationId: 'conversation-1', resumeBatchId: 'batch-1' });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      conversationId: 'conversation-1',
      resumeBatchId: 'batch-1',
      channel: 'shell',
    });
  });

  it.each([
    ['unknown pillar', { target: null }],
    ['missing service-account key', { key: null }],
  ] as const)('returns unavailable for %s without fetching', async (_case, options) => {
    const { client, fetchImpl, discovery } = makeHarness(options);
    await expect(open(client)).resolves.toMatchObject({
      kind: 'unavailable',
      pillar: 'cerebrum',
      status: 503,
    });
    expect(discovery.lookup).toHaveBeenCalledWith('cerebrum');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns unavailable when fetch throws', async () => {
    const { client } = makeHarness({ fetchFailure: new Error('offline') });
    await expect(open(client)).resolves.toMatchObject({ kind: 'unavailable', status: 503 });
  });

  it.each([
    [503, 'unavailable', 503],
    [401, 'gateway-misconfigured', 502],
    [403, 'gateway-misconfigured', 502],
    [400, 'invalid-request', 400],
  ] as const)('maps upstream %i to %s', async (upstreamStatus, kind, status) => {
    const { client } = makeHarness({ response: new Response(null, { status: upstreamStatus }) });
    await expect(open(client)).resolves.toEqual({
      kind,
      pillar: 'cerebrum',
      status,
      upstreamStatus,
    });
  });

  it('returns contract-mismatch for a 200 response without SSE content type', async () => {
    const { client } = makeHarness({ response: sseResponse([], 'application/json') });
    await expect(open(client)).resolves.toEqual({
      kind: 'contract-mismatch',
      pillar: 'cerebrum',
      status: 502,
    });
  });

  it('terminates malformed known frames with a non-retryable read error', async () => {
    const { client } = makeHarness({ response: sseResponse([{ type: 'token' }]) });
    await expect(collect(await open(client))).resolves.toEqual([
      { type: 'error', message: 'The reply could not be read.', retryable: false },
    ]);
  });

  it('reports a stream that closes before done as a retryable truncation', async () => {
    const { client } = makeHarness({ response: sseResponse([{ type: 'token', text: 'partial' }]) });
    await expect(collect(await open(client))).resolves.toEqual([
      { type: 'token', text: 'partial' },
      { type: 'error', message: 'The reply was cut short.', retryable: true },
    ]);
  });

  it('cancels the reader and ends the iterable when the signal aborts', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pulls++ === 0)
            controller.enqueue(encoder.encode('data: {"type":"token","text":"one"}\n\n'));
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const { client } = makeHarness({
      response: new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    });
    const controller = new AbortController();
    const result = await open(client, CHAT, controller.signal);
    if (result.kind !== 'ok') throw new Error('expected an Ego stream');

    const iterator = result.frames[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: 'token', text: 'one' },
      done: false,
    });
    const next = iterator.next();
    await Promise.resolve();
    controller.abort();
    await expect(next).resolves.toEqual({ value: undefined, done: true });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not read another frame after done and cancels the reader', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pulls++ === 0) {
            controller.enqueue(
              encoder.encode(
                'data: {"type":"done","conversationId":"c","messageId":"m","parts":[]}\n\n'
              )
            );
          }
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const { client } = makeHarness({
      response: new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    });
    await expect(collect(await open(client))).resolves.toEqual([
      { type: 'done', conversationId: 'c', messageId: 'm', parts: [{ type: 'text', text: '' }] },
    ]);
    expect(pulls).toBe(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
