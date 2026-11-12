import type { Request } from 'express';

/** Counts the actual stream against the live owner policy without buffering a file in memory. */
export function documentUploadBody(req: Request, limitBytes: number): ReadableStream<Uint8Array> {
  const iterator = (async function* chunks(): AsyncGenerator<Uint8Array> {
    let count = 0;
    for await (const chunk of req) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Upload chunk is not bytes');
      count += chunk.byteLength;
      if (count > limitBytes) throw new RangeError('Upload exceeds owner byte policy');
      yield chunk;
    }
  })();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}
