import { createHash } from 'node:crypto';

import type { PaperlessUploadTarget } from './upload-tokens.js';

/** Stream exact declared bytes and expose proof only after the complete body length and digest are verified. */
export function verifiedUploadStream(
  source: AsyncIterable<unknown>,
  target: PaperlessUploadTarget
): {
  body: ReadableStream<Uint8Array>;
  isVerified: () => boolean;
} {
  const digest = createHash('sha256');
  let bytes = 0;
  let verified = false;
  async function* checked(): AsyncGenerator<Uint8Array> {
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new Error('Upload body is not bytes.');
      bytes += chunk.byteLength;
      if (bytes > target.byteLength) throw new Error('Upload body exceeds its declared length.');
      digest.update(chunk);
      yield chunk;
    }
    if (bytes !== target.byteLength || digest.digest('hex') !== target.sha256)
      throw new Error('Upload body does not match its immutable input.');
    verified = true;
  }
  const iterator = checked();
  return {
    isVerified: () => verified,
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel() {
        await iterator.return(undefined);
      },
    }),
  };
}
