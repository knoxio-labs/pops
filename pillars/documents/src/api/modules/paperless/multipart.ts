/**
 * The `multipart/form-data` body Paperless's `post_document` reads, built as
 * a stream so the file bytes pass straight through without being held in
 * memory. The body always carries an exact `Content-Length`: Paperless runs
 * under a WSGI server that reads a request body only up to its declared
 * length, so a chunked upload reaches Django empty ("No file was submitted").
 */
import { randomUUID } from 'node:crypto';

/** What Paperless is told about the file beside its bytes. */
export interface PaperlessUploadMeta {
  readonly fileName: string;
  readonly mimeType: string;
  readonly title?: string;
}

/** A file's bytes and their exact count. */
export interface SizedFile {
  readonly bytes: AsyncIterable<Uint8Array>;
  readonly length: number;
}

/** A streamed multipart body and the `Content-Type` (naming its boundary) and exact `Content-Length` it needs. */
export interface MultipartBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly headers: { readonly 'Content-Type': string; readonly 'Content-Length': string };
}

const encoder = new TextEncoder();

/** WHATWG's form-data escaping for a quoted header parameter. */
function quoted(value: string): string {
  return value.replaceAll('"', '%22').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function envelope(
  boundary: string,
  meta: PaperlessUploadMeta
): { head: Uint8Array; tail: Uint8Array } {
  const title =
    meta.title === undefined
      ? ''
      : `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${meta.title}\r\n`;
  const document =
    `--${boundary}\r\nContent-Disposition: form-data; name="document"; ` +
    `filename="${quoted(meta.fileName)}"\r\nContent-Type: ${meta.mimeType}\r\n\r\n`;
  return {
    head: encoder.encode(title + document),
    tail: encoder.encode(`\r\n--${boundary}--\r\n`),
  };
}

async function* parts(
  head: Uint8Array,
  file: AsyncIterable<Uint8Array>,
  tail: Uint8Array
): AsyncGenerator<Uint8Array> {
  yield head;
  yield* file;
  yield tail;
}

/**
 * Stream `file` as Paperless's `document` field, with `title` when given.
 * `file.length` must be the exact number of bytes `file.bytes` yields; the
 * `Content-Length` header is computed from it.
 */
export function multipartUpload(file: SizedFile, meta: PaperlessUploadMeta): MultipartBody {
  const boundary = `pops-documents-${randomUUID()}`;
  const { head, tail } = envelope(boundary, meta);
  const iterator = parts(head, file.bytes, tail);
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
  return {
    body,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(head.length + file.length + tail.length),
    },
  };
}
