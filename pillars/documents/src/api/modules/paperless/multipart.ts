/**
 * The `multipart/form-data` body Paperless's `post_document` reads, built as
 * a stream so the file bytes pass straight through without being held in
 * memory.
 */
import { randomUUID } from 'node:crypto';

/** What Paperless is told about the file beside its bytes. */
export interface PaperlessUploadMeta {
  readonly fileName: string;
  readonly mimeType: string;
  readonly title?: string;
}

/** A streamed multipart body and the `Content-Type` that names its boundary. */
export interface MultipartBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
}

const encoder = new TextEncoder();

/** WHATWG's form-data escaping for a quoted header parameter. */
function quoted(value: string): string {
  return value.replaceAll('"', '%22').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

async function* parts(
  boundary: string,
  file: AsyncIterable<Uint8Array>,
  meta: PaperlessUploadMeta
): AsyncGenerator<Uint8Array> {
  if (meta.title !== undefined) {
    yield encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${meta.title}\r\n`
    );
  }
  yield encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="document"; ` +
      `filename="${quoted(meta.fileName)}"\r\nContent-Type: ${meta.mimeType}\r\n\r\n`
  );
  yield* file;
  yield encoder.encode(`\r\n--${boundary}--\r\n`);
}

/** Stream `file` as Paperless's `document` field, with `title` when given. */
export function multipartUpload(
  file: AsyncIterable<Uint8Array>,
  meta: PaperlessUploadMeta
): MultipartBody {
  const boundary = `pops-documents-${randomUUID()}`;
  const iterator = parts(boundary, file, meta);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
