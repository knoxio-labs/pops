import { PopsError } from '@pops/pillar-express';

/** Schema-typed helpers for the Cerebrum Ego SSE route. */
import type { Response } from 'express';

import type { EgoStreamFrame } from '../../contract/rest-ego-stream.js';

/** Set the headers required for an unbuffered Ego event stream. */
export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Write one contract-valid Ego frame as an SSE data event. */
export function writeSseEvent(res: Response, data: EgoStreamFrame): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Convert an Ego stream failure into the contract's error frame. */
export function streamError(
  err: unknown,
  requestId: string | undefined
): Extract<EgoStreamFrame, { type: 'error' }> {
  if (err instanceof PopsError) {
    return {
      type: 'error',
      code: err.code,
      message: err.message,
      ...(requestId === undefined ? {} : { requestId }),
      retryable: err.retryable,
    };
  }
  console.error('[cerebrum] ego stream failure', { requestId, error: err });
  return {
    type: 'error',
    code: 'cerebrum.internal.failure',
    message: 'The service could not complete the request.',
    ...(requestId === undefined ? {} : { requestId }),
    retryable: false,
  };
}
