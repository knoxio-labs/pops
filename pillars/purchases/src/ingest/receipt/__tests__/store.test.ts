import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { looksLikeImage, receiptUri, storeReceiptImage } from '../store.js';

import type { ReceiptImage } from '../vision.js';

const root = mkdtempSync(join(tmpdir(), 'pops-receipts-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 3),
]);

const image = (
  bytes: Buffer,
  mediaType: ReceiptImage['mediaType'] = 'image/jpeg'
): ReceiptImage => ({
  mediaType,
  dataBase64: bytes.toString('base64'),
});

describe('storing a photograph', () => {
  it('writes the bytes and names the file for their hash', () => {
    const stored = storeReceiptImage(image(JPEG), root);
    expect(stored.alreadyPresent).toBe(false);
    expect(stored.bytes).toBe(JPEG.length);
    expect(stored.path).toContain(stored.sha256);
    expect(readFileSync(stored.path).equals(JPEG)).toBe(true);
  });

  it('recognises the same photograph rather than writing it twice', () => {
    // The ticket's dedup requirement, made structural: identical bytes
    // land on one path, so there is no check anyone can forget to write.
    const first = storeReceiptImage(image(JPEG), root);
    const second = storeReceiptImage(image(JPEG), root);
    expect(second.sha256).toBe(first.sha256);
    expect(second.path).toBe(first.path);
    expect(second.alreadyPresent).toBe(true);
  });

  it('repairs a half-written file instead of letting it win forever', () => {
    // writeFileSync straight to the final path is not atomic, so a crash
    // part-way through leaves a short file under a name that claims to be
    // the hash of the whole thing. Testing only that the path exists would
    // make that truncated file permanent: every later upload of the same
    // photograph finds it and skips past.
    const stored = storeReceiptImage(image(JPEG), root);
    writeFileSync(stored.path, JPEG.subarray(0, 4));
    expect(readFileSync(stored.path).length).toBe(4);

    const again = storeReceiptImage(image(JPEG), root);

    expect(again.path).toBe(stored.path);
    expect(again.alreadyPresent).toBe(false);
    expect(again.bytes).toBe(JPEG.length);
    expect(readFileSync(again.path).equals(JPEG)).toBe(true);
  });

  it('leaves no scratch files behind', () => {
    const stored = storeReceiptImage(image(PNG, 'image/png'), root);
    const siblings = readdirSync(dirname(stored.path));
    expect(siblings.some((name) => name.endsWith('.partial'))).toBe(false);
  });

  it('keeps different photographs apart', () => {
    const a = storeReceiptImage(image(JPEG), root);
    const b = storeReceiptImage(image(PNG, 'image/png'), root);
    expect(b.sha256).not.toBe(a.sha256);
    expect(b.path).not.toBe(a.path);
  });

  it('cannot let a truncated upload overwrite a good one', () => {
    // Different bytes, different name — so a re-upload that fails halfway
    // cannot silently replace the copy that worked.
    const whole = storeReceiptImage(image(JPEG), root);
    const truncated = storeReceiptImage(image(JPEG.subarray(0, 8)), root);
    expect(truncated.path).not.toBe(whole.path);
    expect(readFileSync(whole.path).equals(JPEG)).toBe(true);
  });

  it('shards the tree, because a flat directory does not survive a decade', () => {
    const stored = storeReceiptImage(image(JPEG), root);
    expect(stored.path).toContain(join(root, stored.sha256.slice(0, 2)));
  });

  it('addresses the image by a pops:// URI a purchase can carry', () => {
    const stored = storeReceiptImage(image(JPEG), root);
    expect(stored.uri).toBe(receiptUri(stored.sha256));
    expect(stored.uri).toMatch(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u);
  });
});

describe('checking an upload before the model sees it', () => {
  it('accepts each type it claims to accept', () => {
    expect(looksLikeImage(JPEG.toString('base64'), 'image/jpeg')).toBe(true);
    expect(looksLikeImage(PNG.toString('base64'), 'image/png')).toBe(true);
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
    expect(looksLikeImage(gif.toString('base64'), 'image/gif')).toBe(true);
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(8),
    ]);
    expect(looksLikeImage(webp.toString('base64'), 'image/webp')).toBe(true);
  });

  it('refuses a file mislabelled as another type', () => {
    // "That is not a JPEG" is something the user can act on. A vision
    // model's confusion about it is not, and costs a call to discover.
    expect(looksLikeImage(PNG.toString('base64'), 'image/jpeg')).toBe(false);
    expect(looksLikeImage(JPEG.toString('base64'), 'image/png')).toBe(false);
  });

  it('refuses something that is not an image at all', () => {
    const pdf = Buffer.from('%PDF-1.7\n%����\n', 'binary');
    expect(looksLikeImage(pdf.toString('base64'), 'image/jpeg')).toBe(false);
    expect(looksLikeImage(Buffer.from('hello there').toString('base64'), 'image/png')).toBe(false);
  });

  it('refuses base64 that is not base64', () => {
    // `Buffer.from(s, 'base64')` never throws — it skips what it does not
    // recognise and returns a short buffer — so a corrupted upload used to
    // reach the model as a plausible-looking image.
    expect(looksLikeImage('not base64 at all!!', 'image/jpeg')).toBe(false);
    expect(looksLikeImage('////@@@@////', 'image/jpeg')).toBe(false);
    // Truncated: a valid alphabet, but not a whole number of quanta.
    expect(looksLikeImage(JPEG.toString('base64').slice(0, -1), 'image/jpeg')).toBe(false);
  });

  it('tolerates the line breaks a base64 encoder may insert', () => {
    const wrapped = JPEG.toString('base64').replace(/(.{4})/u, '$1\n');
    expect(looksLikeImage(wrapped, 'image/jpeg')).toBe(true);
  });

  it('refuses an upload too short to be anything', () => {
    expect(looksLikeImage('', 'image/jpeg')).toBe(false);
    expect(looksLikeImage(Buffer.from([0xff, 0xd8]).toString('base64'), 'image/jpeg')).toBe(false);
  });
});
