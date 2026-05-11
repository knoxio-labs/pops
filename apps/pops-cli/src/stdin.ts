/**
 * Read all of stdin to a string. Returns an empty string when stdin is a TTY
 * (interactive shell, no piped input) so the caller can fall back to
 * arguments without hanging waiting for an EOF the user will never type.
 */
export async function readStdin(stream: NodeJS.ReadStream = process.stdin): Promise<string> {
  if (stream.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
