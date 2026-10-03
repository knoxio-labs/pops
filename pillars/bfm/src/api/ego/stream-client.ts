import { SERVICE_ACCOUNT_HEADER, resolveApiKey } from '@pops/pillar-sdk/server';

import { buildRawDiscovery } from '../pillars/raw-discovery.js';
import { readUpstreamFrame, SseReader } from './stream-wire.js';

import type {
  MobileEgoStreamBody,
  MobileEgoStreamFrame,
} from '../../contract/mobile-ego-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';
import type { RawDiscovery } from '../pillars/raw-discovery.js';

const CEREBRUM_PILLAR_ID = 'cerebrum';
const STREAM_PATH = '/ego/chat/stream';

type OpenStreamResult =
  | { readonly kind: 'ok'; readonly frames: AsyncIterable<MobileEgoStreamFrame> }
  | GatewayFailure;

export interface EgoStreamClient {
  /** Open one phone-shaped Ego stream or return a gateway failure before streaming. */
  open(input: { body: MobileEgoStreamBody; signal: AbortSignal }): Promise<OpenStreamResult>;
}

interface EgoStreamClientDependencies {
  readonly discovery?: RawDiscovery;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: () => string | undefined;
}

/** Create BFM's raw streaming leg to Cerebrum; SSE is outside its JSON contract. */
export function createEgoStreamClient(deps: EgoStreamClientDependencies = {}): EgoStreamClient {
  const discovery = deps.discovery ?? buildRawDiscovery();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? resolveApiKey;

  return {
    open: async ({ body, signal }) => {
      const target = await discovery.lookup(CEREBRUM_PILLAR_ID).catch(() => undefined);
      if (target === undefined) return unavailable();

      let key: string | undefined;
      try {
        key = apiKey();
      } catch {
        return unavailable();
      }
      if (key === undefined || key.length === 0) return unavailable();

      const response = await fetchImpl(target.baseUrl.replace(/\/+$/u, '') + STREAM_PATH, {
        method: 'POST',
        headers: {
          [SERVICE_ACCOUNT_HEADER]: key,
          accept: 'text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify(toUpstreamBody(body)),
        signal,
      }).catch(() => undefined);
      if (response === undefined) return unavailable();
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined);
        return upstreamFailure(response.status);
      }
      if (response.body === null || !isEventStream(response.headers.get('content-type'))) {
        void response.body?.cancel().catch(() => undefined);
        return { kind: 'contract-mismatch', pillar: CEREBRUM_PILLAR_ID, status: 502 };
      }
      return { kind: 'ok', frames: readFrames(response.body, signal) };
    },
  };
}

function toUpstreamBody(body: MobileEgoStreamBody): Record<string, unknown> {
  if ('resumeBatchId' in body) {
    return {
      conversationId: body.conversationId,
      resumeBatchId: body.resumeBatchId,
      channel: 'shell',
    };
  }
  return {
    message: body.message,
    ...(body.conversationId === undefined ? {} : { conversationId: body.conversationId }),
    ...(body.appContext === undefined ? {} : { appContext: body.appContext }),
    channel: 'shell',
  };
}

function isEventStream(contentType: string | null): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream';
}

function upstreamFailure(status: number): GatewayFailure {
  if (status === 401 || status === 403) {
    return {
      kind: 'gateway-misconfigured',
      pillar: CEREBRUM_PILLAR_ID,
      status: 502,
      upstreamStatus: status,
    };
  }
  if (status === 400) {
    return {
      kind: 'invalid-request',
      pillar: CEREBRUM_PILLAR_ID,
      status: 400,
      upstreamStatus: status,
    };
  }
  return unavailable(status);
}

function unavailable(upstreamStatus?: number): GatewayFailure {
  return {
    kind: 'unavailable',
    pillar: CEREBRUM_PILLAR_ID,
    status: 503,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
  };
}

async function* readFrames(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<MobileEgoStreamFrame> {
  const reader = body.getReader();
  const sseReader = new SseReader();
  const state = { streamedText: '' };
  let cancelPromise: Promise<void> | undefined;

  const cancelReader = (): Promise<void> => {
    cancelPromise ??= reader.cancel().then(
      () => undefined,
      () => undefined
    );
    return cancelPromise;
  };
  const onAbort = (): void => {
    void cancelReader();
  };

  signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const result = await reader.read();
      if (signal.aborted) return;

      const payloads = result.done ? sseReader.finish() : sseReader.feed(result.value);
      if (yield* emitPayloads(payloads, state, signal, cancelReader)) return;
      if (result.done) {
        yield { type: 'error', message: 'The reply was cut short.', retryable: true };
        return;
      }
    }
  } catch {
    if (!signal.aborted) {
      yield { type: 'error', message: 'The reply was cut short.', retryable: true };
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await cancelReader();
    reader.releaseLock();
  }
}

interface MappedFrame {
  readonly frame: MobileEgoStreamFrame;
  readonly terminal: boolean;
}

async function* emitPayloads(
  payloads: readonly string[],
  state: { streamedText: string },
  signal: AbortSignal,
  cancelReader: () => Promise<void>
): AsyncGenerator<MobileEgoStreamFrame, boolean> {
  for (const item of mapPayloads(payloads, state)) {
    if (signal.aborted) return true;
    if (item.terminal) await cancelReader();
    yield item.frame;
    if (item.terminal) return true;
  }
  return signal.aborted;
}

function mapPayloads(payloads: readonly string[], state: { streamedText: string }): MappedFrame[] {
  const frames: MappedFrame[] = [];
  for (const payload of payloads) {
    const reading = readUpstreamFrame(payload, state.streamedText);
    if (reading.kind === 'skip') continue;
    if (reading.kind === 'malformed') {
      frames.push({
        frame: { type: 'error', message: 'The reply could not be read.', retryable: false },
        terminal: true,
      });
      break;
    }

    const frame = reading.frame;
    if (frame.type === 'token') state.streamedText += frame.text;
    const terminal = frame.type === 'done' || frame.type === 'error';
    frames.push({ frame, terminal });
    if (terminal) break;
  }
  return frames;
}
