/**
 * Structural type the CLI needs from a stdin-like stream: a TTY flag and
 * async iteration over chunks. Kept narrower than `NodeJS.ReadStream` so
 * tests can pass a plain `Readable` without unsafe casts.
 */
export interface StdinSource {
  readonly isTTY?: boolean;
  [Symbol.asyncIterator](): AsyncIterator<Buffer | string>;
}

/**
 * Read all of stdin to a string. Returns an empty string when stdin is a TTY
 * (interactive shell, no piped input) so the caller can fall back to
 * arguments without hanging waiting for an EOF the user will never type.
 */
export async function readStdin(stream: StdinSource = process.stdin): Promise<string> {
  if (stream.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
