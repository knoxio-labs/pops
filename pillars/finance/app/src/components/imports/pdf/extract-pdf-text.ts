/**
 * Reading the text out of an uploaded PDF, in the browser.
 *
 * ## Why the browser
 *
 * A bank statement is the densest personal record this application handles. The
 * CSV importer already parses entirely on the client, and doing the same here
 * means the statement bytes never leave the machine that opened them: there is
 * no upload, no request body, no temporary file, and nothing to decide about
 * retention because nothing is ever stored. The `File` the user picked is read
 * into an `ArrayBuffer`, parsed, and dropped when the wizard's state moves on.
 * What reaches the server is what the CSV path already sends — parsed
 * transactions.
 *
 * The cost is bundle size, which is why the library is behind a dynamic
 * `import()`: a session that never uploads a PDF never downloads it.
 *
 * ## Outcomes, not exceptions
 *
 * Every way this can fail is a thing the person uploading can act on, so each
 * one is a named outcome rather than a thrown error: a locked statement needs
 * unlocking, a scanned one needs a different copy, the wrong file needs
 * replacing. The catch-all {@link PdfExtraction} variant carries the underlying
 * message so an unanticipated failure is still reported rather than presented
 * as a statement with no charges on it.
 */
import { linesFromTextItems, type PdfTextItem } from './pdf-text-lines';

/** What reading a PDF produced. Exactly one of these, never an exception. */
export type PdfExtraction =
  | { outcome: 'text'; text: string; pageCount: number }
  /** The file is encrypted and pdf.js was not given a password. */
  | { outcome: 'password-protected' }
  /** A readable PDF whose pages carry no text — a scan or a page of images. */
  | { outcome: 'no-text-layer'; pageCount: number }
  /** The bytes are not a PDF, or are a PDF too damaged to open. */
  | { outcome: 'not-a-pdf'; detail: string }
  /** Anything else. Reported rather than swallowed. */
  | { outcome: 'unreadable'; detail: string };

/**
 * pdf.js error identity, taken from `name` rather than `instanceof`.
 *
 * `instanceof` would need the library imported eagerly just to hold the classes
 * for comparison, which is the opposite of loading it on demand. pdf.js sets
 * these names on its own exception classes and its test suite asserts them.
 */
const PASSWORD_ERROR = 'PasswordException';
const INVALID_PDF_ERROR = 'InvalidPDFException';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/** Map a thrown pdf.js failure onto the outcome the wizard shows. */
export function classifyPdfFailure(error: unknown): Exclude<PdfExtraction, { outcome: 'text' }> {
  const name = nameOf(error);
  if (name === PASSWORD_ERROR) return { outcome: 'password-protected' };
  if (name === INVALID_PDF_ERROR) return { outcome: 'not-a-pdf', detail: messageOf(error) };
  return { outcome: 'unreadable', detail: messageOf(error) };
}

/**
 * pdf.js's text runs, as much of them as {@link linesFromTextItems} needs.
 *
 * A page's item list can also hold marked-content markers, which carry no `str`
 * at all; anything without one is dropped before reconstruction.
 */
function asTextItems(items: readonly unknown[]): PdfTextItem[] {
  const textItems: PdfTextItem[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Partial<PdfTextItem>;
    if (typeof candidate.str !== 'string') continue;
    if (typeof candidate.width !== 'number' || !Array.isArray(candidate.transform)) continue;
    textItems.push({
      str: candidate.str,
      width: candidate.width,
      transform: candidate.transform,
      hasEOL: candidate.hasEOL === true,
    });
  }
  return textItems;
}

/**
 * pdf.js's `legacy` build, on both sides.
 *
 * The default build reaches for browser globals (`DOMMatrix`) at module scope
 * that neither Node nor jsdom defines, so a test could only run it behind
 * hand-written stubs of the very APIs it is being trusted with. The legacy
 * build guards them and runs unchanged in the browser, in Node and under
 * jsdom — which is what lets these outcomes be pinned against real PDF bytes
 * rather than against a mock of the library.
 */
async function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/**
 * Point pdf.js at its worker, unless it has already chosen one.
 *
 * pdf.js sets `workerSrc` itself, in a static initialiser, whenever it detects
 * a Node-like environment — where it runs the worker's code on the main thread
 * instead of spawning one. Overwriting that would replace a path it can resolve
 * with a bundled asset URL it cannot. So this only fills the value in when it is
 * still empty, which is exactly the browser case where a real worker is spawned.
 *
 * A consequence worth stating: every test here runs the main-thread path. The
 * spawned-worker path is only exercised by a real browser.
 */
async function configuredPdfjs() {
  const pdfjs = await loadPdfjs();
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc ||= workerUrl;
  return pdfjs;
}

/**
 * Read every page of a PDF and return its text, one statement line per line.
 *
 * `bytes` is consumed by pdf.js and must not be reused by the caller
 * afterwards — pdf.js transfers the buffer to its worker.
 */
export async function extractPdfText(bytes: ArrayBuffer): Promise<PdfExtraction> {
  let loadingTask;
  try {
    const pdfjs = await configuredPdfjs();
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // Nothing here draws a page, so the document's fonts are never needed;
      // leaving them off keeps a statement's embedded font programs from being
      // installed into the document for no reason. No `standardFontDataUrl`
      // for the same reason (POPS-2540): the run widths the line reconstruction
      // measures come from pdf.js's built-in core-font metrics, not from a font
      // program, and bundling `pdfjs-dist/standard_fonts/` into the shell would
      // cross the package boundary for data nothing here reads.
      disableFontFace: true,
    });
    const document = await loadingTask.promise;
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(...linesFromTextItems(asTextItems(content.items)));
      page.cleanup();
    }
    return lines.length === 0
      ? { outcome: 'no-text-layer', pageCount: document.numPages }
      : { outcome: 'text', text: lines.join('\n'), pageCount: document.numPages };
  } catch (error) {
    return classifyPdfFailure(error);
  } finally {
    await loadingTask?.destroy();
  }
}
