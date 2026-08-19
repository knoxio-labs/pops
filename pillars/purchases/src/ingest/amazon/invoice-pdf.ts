/**
 * Reading the order number off an Amazon tax-invoice PDF.
 *
 * These invoices are generated from a template and every one of them carries
 * a real text layer: the order number is a Latin-1 string literal inside a
 * Flate-compressed content stream, not pixels. So the mapping from a PDF to
 * the order it belongs to is a parse, not an inference — no model call, no
 * rasteriser, no PDF library, and an answer that is either exactly right or
 * absent rather than plausible.
 *
 * That is the whole reason this file is fifty lines of `node:zlib` instead
 * of a batch job. It is deliberately not a general PDF reader: it handles
 * what this one generator emits and reports anything else as unreadable,
 * because a partial general reader would fail silently where this fails
 * loudly.
 */
import { inflateSync } from 'node:zlib';

import type { DocumentKind } from '../../contract/constants.js';

/**
 * An Amazon order id: three alphanumerics, seven digits, seven digits.
 *
 * The first group is not always numeric — a digital order reads `D01-…`
 * where a retail one reads `249-…` — so a digits-only pattern silently
 * matches only part of the bundle.
 */
const ORDER_ID = String.raw`[A-Z0-9]{3}-\d{7}-\d{7}`;

/**
 * The three labels this generator has used for the same field.
 *
 * The template was revised twice over the bundle's date range and each
 * revision renamed it. All three are live in one download, so reading only
 * the current one leaves the older invoices unattached.
 */
const ORDER_ID_FIELD = new RegExp(String.raw`Order (?:Number:|no\.|#)\s*(${ORDER_ID})`, 'gu');

/** The invoice's own identifier, under the two names the template gives it. */
const DOCUMENT_NUMBER_FIELD = /(?:Invoice Number:|Document #)\s*([A-Za-z0-9-]+)/u;

/** Only a stream holding a text-showing operator is a page's content. */
const SHOWS_TEXT = /[)>\]\s]T[jJ](?![A-Za-z])/u;

const STREAMS = /stream\r?\n([\s\S]*?)endstream/gu;

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
};

/**
 * Decode the escape sequence beginning at the backslash on `at`.
 *
 * @returns The text it contributes and the index just past it.
 */
function readEscape(content: string, at: number): { text: string; next: number } {
  const octal = /^[0-7]{1,3}/u.exec(content.slice(at + 1, at + 4))?.[0];
  if (octal !== undefined) {
    return { text: String.fromCharCode(Number.parseInt(octal, 8)), next: at + 1 + octal.length };
  }

  // A backslash before a newline continues the literal onto the next line and
  // contributes nothing to the text.
  const escaped = content[at + 1] ?? '';
  if (escaped === '\n') return { text: '', next: at + 2 };
  if (escaped === '\r') return { text: '', next: content[at + 2] === '\n' ? at + 3 : at + 2 };

  return { text: ESCAPES[escaped] ?? escaped, next: at + 2 };
}

/**
 * Read one PDF string literal, starting just past its opening parenthesis.
 *
 * Parentheses nest inside a literal and only the unbalanced closing one ends
 * it, so a regex that stops at the first `)` truncates any line containing
 * `(incl. GST)` — which is most of them. Depth is tracked for that reason.
 *
 * @returns The decoded text and the index just past the closing parenthesis.
 */
function readLiteral(content: string, start: number): { text: string; end: number } {
  let text = '';
  let depth = 1;
  let at = start;

  while (at < content.length) {
    const char = content[at] ?? '';

    if (char === '\\') {
      const escape = readEscape(content, at);
      text += escape.text;
      at = escape.next;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return { text, end: at + 1 };
    }
    text += char;
    at += 1;
  }

  return { text, end: at };
}

/** Every string literal in a content stream, in the order they are drawn. */
function literalsIn(content: string): string[] {
  const literals: string[] = [];
  let at = 0;
  while (at < content.length) {
    const opened = content.indexOf('(', at);
    if (opened === -1) break;
    const { text, end } = readLiteral(content, opened + 1);
    literals.push(text);
    at = end;
  }
  return literals;
}

/**
 * Every text run a PDF draws, in drawing order.
 *
 * Streams that do not decompress (the embedded JPEG logo) and streams with no
 * text-showing operator (font programs) are skipped, so a font's binary
 * cannot inject bytes between a label and its value.
 */
export function extractPdfRuns(pdf: Buffer): readonly string[] {
  const raw = pdf.toString('latin1');
  const runs: string[] = [];

  for (const [, body] of raw.matchAll(STREAMS)) {
    if (body === undefined) continue;
    let content: string;
    try {
      content = inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    if (!SHOWS_TEXT.test(content)) continue;
    runs.push(...literalsIn(content));
  }

  return runs;
}

/**
 * The page text of a PDF, as the drawn runs joined by spaces.
 *
 * Joined rather than concatenated because a label and its value are separate
 * runs — `Order Number:` and the id are drawn at two positions — and the
 * fields below match across that gap. Layout is not reconstructed: nothing
 * here needs to know which column a run sat in.
 */
export function extractPdfText(pdf: Buffer): string {
  return extractPdfRuns(pdf).join(' ');
}

export interface AmazonInvoiceFields {
  readonly sourceOrderId: string;
  /** The invoice's or credit note's own number, for spotting a re-render. */
  readonly documentNumber: string | null;
  /** The heading the document gives itself, verbatim. */
  readonly documentType: string;
  readonly kind: DocumentKind;
}

export type InvoiceReadFailure = 'no-text-layer' | 'no-order-id' | 'ambiguous-order-id';

export type AmazonInvoiceRead =
  | { readonly ok: true; readonly fields: AmazonInvoiceFields }
  | { readonly ok: false; readonly failure: InvoiceReadFailure; readonly detail: string };

/**
 * What the document calls itself, mapped onto a stored `kind`.
 *
 * A credit note is not a tax invoice — it unwinds one — so it lands under
 * `other` rather than being filed as the thing it reverses. `DOCUMENT_KINDS`
 * has no entry for a credit note and inventing one belongs with the schema
 * change, not here.
 */
function documentKind(heading: string): DocumentKind {
  const upper = heading.toUpperCase();
  if (upper.includes('ADJUSTMENT NOTE')) return 'other';
  if (upper.includes('TAX INVOICE')) return 'tax_invoice';
  return 'other';
}

/**
 * Read the fields that identify an invoice, or say why it could not be read.
 *
 * Two documents naming two different orders is a refusal rather than a
 * first-match, because there is no rule here that says which of them the
 * file belongs to and picking one would attach evidence to an order it does
 * not describe. No such document exists in the reference bundle.
 */
export function readAmazonInvoice(pdf: Buffer): AmazonInvoiceRead {
  const runs = extractPdfRuns(pdf);
  const text = runs.join(' ');
  if (text.trim() === '') {
    return { ok: false, failure: 'no-text-layer', detail: 'no decompressible text layer' };
  }

  const orderIds = [...new Set([...text.matchAll(ORDER_ID_FIELD)].map(([, id]) => id ?? ''))];
  const [sourceOrderId] = orderIds;
  if (sourceOrderId === undefined) {
    return { ok: false, failure: 'no-order-id', detail: 'no labelled order number' };
  }
  if (orderIds.length > 1) {
    return {
      ok: false,
      failure: 'ambiguous-order-id',
      detail: `names ${String(orderIds.length)} orders: ${orderIds.join(', ')}`,
    };
  }

  // The first run is the heading the template prints at the top of the page,
  // which is the only place the document states what kind of document it is.
  const [heading = ''] = runs;
  return {
    ok: true,
    fields: {
      sourceOrderId,
      documentNumber: DOCUMENT_NUMBER_FIELD.exec(text)?.[1] ?? null,
      documentType: heading.trim(),
      kind: documentKind(heading),
    },
  };
}
