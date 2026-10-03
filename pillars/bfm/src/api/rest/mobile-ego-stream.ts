/** Relay the uncontracted mobile Ego event stream to a paired device. */
import { Router } from 'express';

import { MobileEgoStreamBodySchema } from '../../contract/mobile-ego-schemas.js';
import { invalidRequestBody } from '../errors.js';
import { MOBILE_EGO_CHAT_STREAM_PATH } from '../paths.js';
import { toUpstreamErrorResponse } from './upstream-error.js';

import type { Request, Response } from 'express';

import type {
  MobileEgoStreamBody,
  MobileEgoStreamFrame,
} from '../../contract/mobile-ego-schemas.js';
import type { EgoStreamClient } from '../ego/stream-client.js';

const DEFAULT_EGO_HEARTBEAT_MS = 15_000;
const CUT_SHORT_FRAME: MobileEgoStreamFrame = {
  type: 'error',
  message: 'The reply was cut short.',
  retryable: true,
};

/** Dependencies for BFM's uncontracted mobile Ego event-stream route. */
export interface MobileEgoStreamDeps {
  readonly egoStream: EgoStreamClient;
  readonly egoHeartbeatMs?: number;
}

/**
 * Build the one `/mobile` route outside the ts-rest contract. Its capability
 * is declared beside the gate in `UNCONTRACTED_MOBILE_ROUTES`.
 */
export function makeMobileEgoStreamRouter(deps: MobileEgoStreamDeps): Router {
  const router = Router();
  const heartbeatMs = deps.egoHeartbeatMs ?? DEFAULT_EGO_HEARTBEAT_MS;

  router.post(MOBILE_EGO_CHAT_STREAM_PATH, async (req, res): Promise<void> => {
    const parsed = MobileEgoStreamBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(invalidRequestBody());
      return;
    }

    await relayStream(req, res, { deps, body: parsed.data, heartbeatMs });
  });

  return router;
}

async function relayStream(
  req: Request,
  res: Response,
  input: {
    readonly deps: MobileEgoStreamDeps;
    readonly body: MobileEgoStreamBody;
    readonly heartbeatMs: number;
  }
): Promise<void> {
  const controller = new AbortController();
  const removeDisconnectHandlers = listenForDisconnect(req, res, controller);
  try {
    const outcome = await input.deps.egoStream.open({
      body: input.body,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (outcome.kind !== 'ok') {
      const error = toUpstreamErrorResponse(outcome);
      res.status(error.status).json(error.body);
      return;
    }
    await relayFrames(res, outcome.frames, controller.signal, input.heartbeatMs);
  } finally {
    removeDisconnectHandlers();
  }
}

function listenForDisconnect(req: Request, res: Response, controller: AbortController): () => void {
  const onRequestClose = (): void => {
    // Node emits IncomingMessage `close` when a complete request body is
    // consumed, even while its response is being streamed. An incomplete
    // request close means the client abandoned its request.
    if (!res.writableEnded && !req.complete) controller.abort();
  };
  const onResponseClose = (): void => {
    if (!res.writableEnded) controller.abort();
  };

  req.once('close', onRequestClose);
  res.once('close', onResponseClose);
  return () => {
    req.off('close', onRequestClose);
    res.off('close', onResponseClose);
  };
}

async function relayFrames(
  res: Response,
  frames: AsyncIterable<MobileEgoStreamFrame>,
  signal: AbortSignal,
  heartbeatMs: number
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => writeHeartbeat(res, signal), heartbeatMs);
  try {
    await writeFrames(res, frames, signal);
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}

async function writeFrames(
  res: Response,
  frames: AsyncIterable<MobileEgoStreamFrame>,
  signal: AbortSignal
): Promise<void> {
  try {
    for await (const frame of frames) {
      if (!canWrite(res, signal)) break;
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    }
  } catch {
    if (canWrite(res, signal)) res.write(`data: ${JSON.stringify(CUT_SHORT_FRAME)}\n\n`);
  }
}

function writeHeartbeat(res: Response, signal: AbortSignal): void {
  if (canWrite(res, signal)) res.write(': keep-alive\n\n');
}

function canWrite(res: Response, signal: AbortSignal): boolean {
  return !signal.aborted && !res.writableEnded && !res.destroyed;
}
