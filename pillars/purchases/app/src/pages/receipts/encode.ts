/**
 * Chunked because `String.fromCharCode(...bytes)` spreads one argument per
 * byte, and a phone photograph is enough arguments to overflow the call stack.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * A file's bytes as plain base64 — no `data:` prefix, which the upload
 * contract does not accept.
 */
export async function encodeFile(file: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

/**
 * A pasted body as base64 of its UTF-8 bytes.
 *
 * `text/plain` travels base64 like every other part so the pillar keeps one
 * content-addressed store and one dedup key.
 */
export function encodeText(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}
