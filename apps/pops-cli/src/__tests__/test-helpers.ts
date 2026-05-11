import { Readable, Writable } from 'node:stream';

/** In-memory writable stream that captures all writes for assertion. */
export class CaptureStream extends Writable {
  private chunks: string[] = [];
  // commander/fetch only call `write`, but commander itself accesses `isTTY`
  // when checking colour support; expose a deterministic value so tests don't
  // depend on the host terminal.
  readonly isTTY = false;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    cb: (err?: Error | null) => void
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    cb();
  }

  text(): string {
    return this.chunks.join('');
  }
}

/** Readable stream pretending to be a piped stdin (not a TTY). */
export function pipedStdin(content: string): NodeJS.ReadStream {
  const readable = Readable.from(Buffer.from(content, 'utf8'));
  // The CLI checks `isTTY` to decide whether to wait on stdin.
  Object.defineProperty(readable, 'isTTY', { value: false });
  return readable as unknown as NodeJS.ReadStream;
}

/** Readable stream that pretends to be an interactive TTY (no piped input). */
export function ttyStdin(): NodeJS.ReadStream {
  const readable = new Readable({ read() {} });
  Object.defineProperty(readable, 'isTTY', { value: true });
  return readable as unknown as NodeJS.ReadStream;
}
