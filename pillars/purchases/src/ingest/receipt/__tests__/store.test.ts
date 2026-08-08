import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { looksLikeMediaType, receiptUri, storeReceiptPart } from '../store.js';
import { MEDIA_TYPES } from '../vision.js';

import type { ReceiptPart } from '../vision.js';

const root = mkdtempSync(join(tmpdir(), 'pops-receipts-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 3),
]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'binary');
const EMAIL = Buffer.from('Your order\nTimber Pine DAR 42x19  $12.50\nTotal  $12.50\n', 'utf8');

const image = (bytes: Buffer, mediaType: ReceiptPart['mediaType'] = 'image/jpeg'): ReceiptPart => ({
  mediaType,
  dataBase64: bytes.toString('base64'),
});

describe('storing a photograph', () => {
  it('writes the bytes and names the file for their hash', () => {
    const stored = storeReceiptPart(image(JPEG), root);
    expect(stored.alreadyPresent).toBe(false);
    expect(stored.bytes).toBe(JPEG.length);
    expect(stored.path).toContain(stored.sha256);
    expect(readFileSync(stored.path).equals(JPEG)).toBe(true);
  });

  it('recognises the same photograph rather than writing it twice', () => {
    // The ticket's dedup requirement, made structural: identical bytes
    // land on one path, so there is no check anyone can forget to write.
    const first = storeReceiptPart(image(JPEG), root);
    const second = storeReceiptPart(image(JPEG), root);
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
    const stored = storeReceiptPart(image(JPEG), root);
    writeFileSync(stored.path, JPEG.subarray(0, 4));
    expect(readFileSync(stored.path).length).toBe(4);

    const again = storeReceiptPart(image(JPEG), root);

    expect(again.path).toBe(stored.path);
    expect(again.alreadyPresent).toBe(false);
    expect(again.bytes).toBe(JPEG.length);
    expect(readFileSync(again.path).equals(JPEG)).toBe(true);
  });

  it('leaves no scratch files behind', () => {
    const stored = storeReceiptPart(image(PNG, 'image/png'), root);
    const siblings = readdirSync(dirname(stored.path));
    expect(siblings.some((name) => name.endsWith('.partial'))).toBe(false);
  });

  it('keeps different photographs apart', () => {
    const a = storeReceiptPart(image(JPEG), root);
    const b = storeReceiptPart(image(PNG, 'image/png'), root);
    expect(b.sha256).not.toBe(a.sha256);
    expect(b.path).not.toBe(a.path);
  });

  it('cannot let a truncated upload overwrite a good one', () => {
    // Different bytes, different name — so a re-upload that fails halfway
    // cannot silently replace the copy that worked.
    const whole = storeReceiptPart(image(JPEG), root);
    const truncated = storeReceiptPart(image(JPEG.subarray(0, 8)), root);
    expect(truncated.path).not.toBe(whole.path);
    expect(readFileSync(whole.path).equals(JPEG)).toBe(true);
  });

  it('shards the tree, because a flat directory does not survive a decade', () => {
    const stored = storeReceiptPart(image(JPEG), root);
    expect(stored.path).toContain(join(root, stored.sha256.slice(0, 2)));
  });

  it('addresses the image by a pops:// URI a purchase can carry', () => {
    const stored = storeReceiptPart(image(JPEG), root);
    expect(stored.uri).toBe(receiptUri(stored.sha256));
    expect(stored.uri).toMatch(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u);
  });
});

describe('storing the shapes that are not photographs', () => {
  it('keeps a PDF byte-for-byte, under its own extension', () => {
    const stored = storeReceiptPart(image(PDF, 'application/pdf'), root);
    expect(stored.path.endsWith('.pdf')).toBe(true);
    expect(readFileSync(stored.path).equals(PDF)).toBe(true);
  });

  it('keeps a pasted body byte-for-byte, under its own extension', () => {
    // Byte-for-byte rather than re-encoded: the paste IS the evidence, and
    // a body normalised on the way in can no longer be compared against
    // what the sender actually saw.
    const stored = storeReceiptPart(image(EMAIL, 'text/plain'), root);
    expect(stored.path.endsWith('.txt')).toBe(true);
    expect(readFileSync(stored.path).equals(EMAIL)).toBe(true);
  });

  it('addresses every shape the same way, so nothing downstream has to ask', () => {
    for (const part of [image(JPEG), image(PDF, 'application/pdf'), image(EMAIL, 'text/plain')]) {
      expect(storeReceiptPart(part, root).uri).toMatch(
        /^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u
      );
    }
  });

  it('dedups a PDF against itself but never against a photograph of it', () => {
    // Two files, two keys. A phone shot and the merchant's own PDF are not
    // the same bytes and must not be conflated here — recognising them as
    // one shop is the write path's job, on the receipt's stated instant
    // and amount, not this layer's.
    const first = storeReceiptPart(image(PDF, 'application/pdf'), root);
    const second = storeReceiptPart(image(PDF, 'application/pdf'), root);
    expect(second.alreadyPresent).toBe(true);
    expect(second.sha256).toBe(first.sha256);
    expect(storeReceiptPart(image(JPEG), root).sha256).not.toBe(first.sha256);
  });
});

describe('checking an upload before the model sees it', () => {
  it('accepts each type it claims to accept', () => {
    expect(looksLikeMediaType(JPEG.toString('base64'), 'image/jpeg')).toBe(true);
    expect(looksLikeMediaType(PNG.toString('base64'), 'image/png')).toBe(true);
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
    expect(looksLikeMediaType(gif.toString('base64'), 'image/gif')).toBe(true);
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(8),
    ]);
    expect(looksLikeMediaType(webp.toString('base64'), 'image/webp')).toBe(true);
    expect(looksLikeMediaType(PDF.toString('base64'), 'application/pdf')).toBe(true);
    expect(looksLikeMediaType(EMAIL.toString('base64'), 'text/plain')).toBe(true);
  });

  it('accepts a PDF whatever version it claims', () => {
    // Refusing a version digit would refuse real invoices: merchants
    // generate these from whatever their accounting package emits.
    for (const version of ['1.3', '1.4', '1.7', '2.0']) {
      const pdf = Buffer.concat([Buffer.from(`%PDF-${version}\n`, 'ascii'), Buffer.alloc(16)]);
      expect(looksLikeMediaType(pdf.toString('base64'), 'application/pdf')).toBe(true);
    }
  });

  it('refuses a file mislabelled as another type', () => {
    // "That is not a JPEG" is something the user can act on. A vision
    // model's confusion about it is not, and costs a call to discover.
    expect(looksLikeMediaType(PNG.toString('base64'), 'image/jpeg')).toBe(false);
    expect(looksLikeMediaType(JPEG.toString('base64'), 'image/png')).toBe(false);
    expect(looksLikeMediaType(JPEG.toString('base64'), 'application/pdf')).toBe(false);
    expect(looksLikeMediaType(PDF.toString('base64'), 'image/jpeg')).toBe(false);
  });

  it('refuses binary claiming to be a pasted body', () => {
    // Text has no magic number, so decoding as UTF-8 is what stands in for
    // one. Without it a mislabelled binary sails through the one check that
    // exists to catch exactly that, and gets billed for.
    expect(looksLikeMediaType(JPEG.toString('base64'), 'text/plain')).toBe(false);
    expect(looksLikeMediaType(PNG.toString('base64'), 'text/plain')).toBe(false);
    const invalidUtf8 = Buffer.from([0xc3, 0x28, 0xff, 0xfe, 0x80, 0x81, 0x82, 0x83, 0, 0, 0, 0]);
    expect(looksLikeMediaType(invalidUtf8.toString('base64'), 'text/plain')).toBe(false);
  });

  it('refuses a pasted body that is only whitespace', () => {
    // Long enough to clear the floor and empty of anything to read. Sending
    // it to the model buys an "unreadable" that cost money.
    const blank = Buffer.from('   \n\t  \n     ', 'utf8');
    expect(looksLikeMediaType(blank.toString('base64'), 'text/plain')).toBe(false);
  });

  it('accepts a pasted body in any script', () => {
    // The prompt asks for descriptions in their original language, so an
    // edge check that only passed ASCII would refuse the receipts that
    // instruction exists for.
    for (const body of ['Итого 1 234,56 ₽', '合計 ¥1,200 税込', 'Σύνολο 12,50 €']) {
      expect(looksLikeMediaType(Buffer.from(body, 'utf8').toString('base64'), 'text/plain')).toBe(
        true
      );
    }
  });

  it('refuses something that is not an image at all', () => {
    expect(looksLikeMediaType(PDF.toString('base64'), 'image/jpeg')).toBe(false);
    expect(looksLikeMediaType(Buffer.from('hello there').toString('base64'), 'image/png')).toBe(
      false
    );
  });

  it('refuses base64 that is not base64', () => {
    // `Buffer.from(s, 'base64')` never throws — it skips what it does not
    // recognise and returns a short buffer — so a corrupted upload used to
    // reach the model as a plausible-looking image.
    expect(looksLikeMediaType('not base64 at all!!', 'image/jpeg')).toBe(false);
    expect(looksLikeMediaType('////@@@@////', 'image/jpeg')).toBe(false);
    // Truncated: a valid alphabet, but not a whole number of quanta.
    expect(looksLikeMediaType(JPEG.toString('base64').slice(0, -1), 'image/jpeg')).toBe(false);
  });

  it('tolerates the line breaks a base64 encoder may insert', () => {
    const wrapped = JPEG.toString('base64').replace(/(.{4})/u, '$1\n');
    expect(looksLikeMediaType(wrapped, 'image/jpeg')).toBe(true);
  });

  it('accepts a paste too short to be a JPEG', () => {
    // The binary formats need twelve bytes to identify themselves; text
    // does not, and inheriting that floor made a short paste impossible to
    // send while the contract advertised a one-character minimum.
    for (const body of ['Tea $3', 'x', 'Итого 5']) {
      expect(looksLikeMediaType(Buffer.from(body, 'utf8').toString('base64'), 'text/plain')).toBe(
        true
      );
    }
  });

  it('refuses an upload too short to be anything', () => {
    expect(looksLikeMediaType('', 'image/jpeg')).toBe(false);
    // Two bytes that satisfy the JPEG magic number and are not a JPEG. The
    // floor is what catches this, not the magic check.
    expect(looksLikeMediaType(Buffer.from([0xff, 0xd8]).toString('base64'), 'image/jpeg')).toBe(
      false
    );
    expect(looksLikeMediaType(Buffer.from('%PDF-').toString('base64'), 'application/pdf')).toBe(
      false
    );
  });

  it('has a rule for every media type the drop-zone accepts', () => {
    // A media type added to the contract without a magic check or a minimum
    // would throw at the edge rather than refuse cleanly. The records that
    // back this are exhaustive by type, so the compiler catches it first;
    // this is what catches it if the records ever stop being exhaustive.
    for (const mediaType of MEDIA_TYPES) {
      expect(() => looksLikeMediaType(JPEG.toString('base64'), mediaType)).not.toThrow();
    }
  });
});
