/**
 * The pipeline, driven by canned model answers.
 *
 * No test here reaches a real API. A test that costs money and needs a
 * network is a test that gets skipped, and this is the layer where being
 * able to rehearse a model's worst behaviour on demand matters most.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../extraction.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../extraction.js')>();
  return { ...actual, parseExtraction: vi.fn(actual.parseExtraction) };
});

import { ExtractedLineSchema, ExtractedReceiptSchema, parseExtraction } from '../extraction.js';
import { readReceipt } from '../read-receipt.js';
import { extractionPrompt, kindOf, MEDIA_TYPES, PROMPT_FIELDS } from '../vision.js';

import type { ReceiptMediaType, ReceiptPart, ReceiptVision } from '../vision.js';

const IMAGE: ReceiptPart = { mediaType: 'image/jpeg', dataBase64: 'ZmFrZQ==' };

/** Every shape the drop-zone accepts, each on its own. */
const EVERY_KIND: readonly ReceiptMediaType[][] = MEDIA_TYPES.map((mediaType) => [mediaType]);

const saying = (answer: string | null): ReceiptVision => ({ read: async () => answer });
const failing = (error: unknown): ReceiptVision => ({
  read: () => Promise.reject(error),
});

const GOOD = JSON.stringify({
  merchantName: 'Bunnings Warehouse',
  purchasedOn: '2026-08-01',
  purchasedAt: '14:32',
  currency: 'AUD',
  total: '$27.50',
  tax: null,
  discounts: [],
  lines: [
    { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
    { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
  ],
  unreadable: [],
});

describe('a reading that holds up', () => {
  it('is admissible, with the extraction carried through', async () => {
    const outcome = await readReceipt(saying(GOOD), [IMAGE]);
    expect(outcome.kind).toBe('read');
    if (outcome.kind !== 'read') return;
    expect(outcome.extracted.merchantName).toBe('Bunnings Warehouse');
    expect(outcome.gate.totalCents).toBe(2750);
  });

  it('survives a model that omits the shipping key entirely', async () => {
    // Most receipts state no delivery, so most readings will omit it. A
    // required field would fail `safeParse`, and every shape failure comes
    // back as `unreadable` — discarding an extraction whose money is
    // perfect over a key about money that was never charged. The default
    // is what keeps the omission meaning "the receipt did not say".
    expect(GOOD).not.toContain('shipping');

    const outcome = await readReceipt(saying(GOOD), [IMAGE]);

    expect(outcome.kind).toBe('read');
    if (outcome.kind !== 'read') return;
    expect(outcome.extracted.shipping).toBeNull();
    expect(outcome.gate.shippingCents).toBe(0);
  });

  it('reads a stated delivery charge through to the gate', async () => {
    const delivered = JSON.stringify({
      ...JSON.parse(GOOD),
      total: '$37.45',
      shipping: '$9.95',
    });

    const outcome = await readReceipt(saying(delivered), [IMAGE]);

    expect(outcome.kind).toBe('read');
    if (outcome.kind !== 'read') return;
    expect(outcome.gate.shippingCents).toBe(995);
    expect(outcome.gate.surchargeCents).toBe(0);
  });

  it('tolerates a model that wraps its JSON in prose or a fence', async () => {
    // Refusing these would discard good extractions over punctuation.
    const fenced = await readReceipt(saying('Here you go:\n```json\n' + GOOD + '\n```'), [IMAGE]);
    const chatty = await readReceipt(saying('Sure! ' + GOOD + ' Hope that helps.'), [IMAGE]);
    expect(fenced.kind).toBe('read');
    expect(chatty.kind).toBe('read');
  });
});

describe('a reading that does not', () => {
  it('goes to review rather than being written as fact', async () => {
    // The purchase is real and the photo exists. Refusing it outright would
    // lose a shop that happened.
    const wrong = JSON.stringify({ ...JSON.parse(GOOD), total: '$99.99' });
    const outcome = await readReceipt(saying(wrong), [IMAGE]);
    expect(outcome.kind).toBe('needs-review');
    if (outcome.kind !== 'needs-review') return;
    expect(outcome.gate.failures.map((f) => f.kind)).toEqual(['sum-mismatch']);
    // Everything read is still available to the reviewer.
    expect(outcome.extracted.lines).toHaveLength(2);
  });

  it('tells a model that was down apart from a receipt that made no sense', async () => {
    // Retrying later and asking the user to re-photograph are different
    // actions, so these must not collapse into one outcome.
    const down = await readReceipt(failing(new Error('socket hang up')), [IMAGE]);
    expect(down).toEqual({
      kind: 'unreadable',
      reason: 'the vision model failed: socket hang up',
    });
  });

  it('treats an absent model as unreadable, never as an empty receipt', async () => {
    for (const answer of [null, '', '   ']) {
      const outcome = await readReceipt(saying(answer), [IMAGE]);
      expect(outcome.kind).toBe('unreadable');
    }
  });

  it('reports unusable output rather than throwing', async () => {
    const outcomes = await Promise.all(
      ['I cannot read this receipt.', '{ not json }', '{"total":"$1.00"}'].map((answer) =>
        readReceipt(saying(answer), [IMAGE])
      )
    );
    expect(outcomes.map((o) => o.kind)).toEqual(['unreadable', 'unreadable', 'unreadable']);
  });

  it('names every field that was wrong, not just the first', async () => {
    // A model that omits four fields has one problem, not four consecutive
    // ones. Reporting them one at a time turns diagnosis into four round
    // trips against a model that answers differently each time.
    const outcome = await readReceipt(saying('{"total":"$1.00","merchantName":null}'), [IMAGE]);
    expect(outcome.kind).toBe('unreadable');
    if (outcome.kind !== 'unreadable') return;
    for (const missing of ['purchasedOn', 'purchasedAt', 'currency', 'tax', 'lines']) {
      expect(outcome.reason).toContain(missing);
    }
  });

  it('propagates an unexpected parse failure rather than filing it as an ordinary bad reading', async () => {
    // `ExtractionShapeError` is the one failure this layer knows how to turn
    // into "ask a human" — anything else is a bug, and swallowing it as
    // `unreadable` would hide it behind a shrug instead of an alert.
    vi.mocked(parseExtraction).mockImplementationOnce(() => {
      throw new TypeError('unexpected extraction bug');
    });
    await expect(readReceipt(saying(GOOD), [IMAGE])).rejects.toThrow('unexpected extraction bug');
  });
});

describe('what a media type is taken to be', () => {
  it('classifies every accepted media type deliberately', () => {
    // Not "everything unrecognised is text". A media type added to the
    // contract without a decision here would previously have been sent to
    // the model as a pasted email body, under the prompt written for one,
    // and named "Text" in its refusals.
    expect(MEDIA_TYPES.map(kindOf)).toEqual(['image', 'image', 'image', 'image', 'pdf', 'text']);
  });

  it('leaves no media type unclassified', () => {
    for (const mediaType of MEDIA_TYPES) {
      expect(['image', 'pdf', 'text']).toContain(kindOf(mediaType));
    }
  });
});

describe('the prompt', () => {
  it('names every field the schema requires, whatever was uploaded', () => {
    // The prompt and the schema are two statements of one contract, and
    // nothing else couples them. Adding a field to the schema without
    // teaching the model about it produces extractions that silently lack
    // it — so that fails here instead.
    //
    // Asserted per kind rather than once: the prompt is now composed from
    // the shapes present, so a field that drifted into a kind-specific
    // paragraph would still pass a single-variant check while being absent
    // from every other upload.
    for (const mediaTypes of EVERY_KIND) {
      const prompt = extractionPrompt(mediaTypes);
      for (const field of Object.keys(PROMPT_FIELDS)) {
        expect(prompt, `${mediaTypes.join(',')} is missing ${field}`).toContain(field);
      }
    }
  });

  it('covers every key the extraction schema names', () => {
    // Read off the schema itself rather than a hand-kept copy. A literal
    // list here is a third statement of the contract, and the one most
    // likely to be forgotten: it passed while the schema and the prompt had
    // both gained `surcharges`, which is the exact drift this guards.
    const schemaKeys = [
      ...Object.keys(ExtractedReceiptSchema.shape),
      ...Object.keys(ExtractedLineSchema.shape),
    ];

    expect(Object.keys(PROMPT_FIELDS).toSorted()).toEqual([...new Set(schemaKeys)].toSorted());
  });

  it('carries the load-bearing instructions into every kind', () => {
    // A model that balances the books on request destroys the only evidence
    // the gate has, and one that silently drops a line it could not read
    // turns a damaged receipt into a wrongly-read one. Neither instruction
    // is decoration, and neither may be lost by composing the prompt.
    for (const mediaTypes of EVERY_KIND) {
      const prompt = extractionPrompt(mediaTypes);
      expect(prompt).toMatch(/do not adjust any figure/i);
      expect(prompt).toMatch(/cannot read/i);
    }
  });

  it('tells the model about the shapes it was given, and no others', () => {
    // Warning a model reading a PDF about overlapping frames invents a
    // problem it does not have; not warning one reading photographs about
    // them produces a receipt whose lines are counted twice.
    const photographs = extractionPrompt(['image/jpeg', 'image/jpeg']);
    expect(photographs).toMatch(/overlap/i);
    expect(photographs).not.toMatch(/PDF/);

    const pdf = extractionPrompt(['application/pdf']);
    expect(pdf).toMatch(/every page/i);
    expect(pdf).not.toMatch(/overlap/i);

    const pasted = extractionPrompt(['text/plain']);
    expect(pasted).toMatch(/unsubscribe/i);
    expect(pasted).not.toMatch(/overlap/i);
  });

  it('describes each shape once when several are uploaded together', () => {
    // Nothing forbids sending the merchant's PDF beside a photograph of the
    // till slip, so the prompt has to cover both — but a kind repeated in
    // the parts is still one set of instructions.
    const mixed = extractionPrompt(['image/jpeg', 'image/jpeg', 'application/pdf']);
    expect(mixed).toMatch(/overlap/i);
    expect(mixed).toMatch(/every page/i);
    expect(mixed.match(/every page/giu)).toHaveLength(1);
  });

  it('is stable for the same upload, so a retry asks the same question', () => {
    const parts: ReceiptMediaType[] = ['application/pdf', 'image/png', 'text/plain'];
    expect(extractionPrompt(parts)).toBe(extractionPrompt(parts));
    // And independent of the order the parts arrived in: the instructions
    // describe the shapes present, not the sequence.
    expect(extractionPrompt(parts)).toBe(extractionPrompt([...parts].toReversed()));
  });
});
