/**
 * Reads a request body as a `Buffer`, capped at `limitBytes`.
 *
 * The media PUT route takes raw image bytes, not JSON — no pillar in this
 * repo has a raw-binary ts-rest route (base64-in-JSON is the established
 * pattern; see `api/modules/photos/service.ts`), and `express.raw()`'s error
 * path depends on Express's error-middleware ordering, which is easy to get
 * wrong silently. Reading the stream by hand keeps the 413 decision local and
 * synchronous with the read.
 */
import type { Request } from 'express';

/** The body exceeded `limitBytes`; the connection has already been destroyed. */
export class PayloadTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Request body exceeded ${limitBytes} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Buffer `req`'s body, rejecting with {@link PayloadTooLargeError} the moment
 * the running total exceeds `limitBytes`. The remaining bytes are left to
 * drain rather than the socket being torn down, so the caller's error
 * response (413) reaches the client instead of racing a reset connection.
 */
export function readRawBody(req: Request, limitBytes: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      reject(err);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limitBytes) {
        fail(new PayloadTooLargeError(limitBytes));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolvePromise(Buffer.concat(chunks));
    });

    req.on('error', (err: Error) => {
      fail(err);
    });
  });
}
