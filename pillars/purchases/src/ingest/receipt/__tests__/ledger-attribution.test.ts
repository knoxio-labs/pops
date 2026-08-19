import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
/**
 * A receipt extraction has to leave an attributable row in the ai pillar's
 * usage ledger, and a record that does not land has to be audible.
 *
 * Driven through the production wiring against a REAL socket, because the
 * thing that was broken is wiring: the pillar spent Anthropic tokens on every
 * receipt and reported them with no per-caller credential, which the ai pillar
 * refuses and which nothing then said. A test with an injected `report` proves
 * `callWithLogging` was called and nothing about what reached the ledger, so
 * this one stands up an ai pillar stand-in and asserts the header and the body
 * on the wire.
 *
 * The Anthropic SDK is the only mock — it is the other network boundary and
 * tests MUST NOT reach a real API.
 */
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import type { ReceiptPart } from '../vision.js';

const LEDGER_SECRET = 'ledger-secret-from-the-mounted-file';
const INLINE_DECOY = 'purchases.inline-decoy-that-must-lose-to-the-file';
const INPUT_PER_MTOK = 3;
const OUTPUT_PER_MTOK = 15;
const INPUT_TOKENS = 100;
const OUTPUT_TOKENS = 20;

const PART: ReceiptPart = {
  mediaType: 'image/png',
  dataBase64: Buffer.from('receipt').toString('base64'),
};

interface LedgerPost {
  readonly credential: string | undefined;
  readonly record: Record<string, unknown>;
}

let server: Server;
let posts: LedgerPost[];
let resolveNextPost: ((post: LedgerPost) => void) | undefined;
let recordStatus: number;
let tmpDir: string;

function nextPost(): Promise<LedgerPost> {
  const seen = posts[posts.length - 1];
  if (seen !== undefined) return Promise.resolve(seen);
  return new Promise<LedgerPost>((resolve) => {
    resolveNextPost = resolve;
  });
}

function aiPillarStandIn(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url !== undefined && req.url.startsWith('/ai-pricing/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ input: INPUT_PER_MTOK, output: OUTPUT_PER_MTOK }));
      return;
    }
    if (req.method === 'POST' && req.url === '/ai-usage/record') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const header = req.headers['x-pops-internal-credential'];
        const post: LedgerPost = {
          credential: Array.isArray(header) ? header.join(',') : header,
          record: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
        };
        posts.push(post);
        resolveNextPost?.(post);
        res.writeHead(recordStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify(recordStatus === 200 ? { ok: true } : { message: 'Forbidden' }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

async function listenOnLoopback(): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the ai pillar stand-in did not bind a TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readOneReceipt(): Promise<void> {
  const { createAnthropicVision } = await import('../anthropic-vision.js');
  const vision = createAnthropicVision();
  if (vision === null) throw new Error('vision was not configured');
  await vision.read([PART]);
}

beforeEach(async () => {
  vi.resetModules();
  createMock.mockReset();
  createMock.mockResolvedValue({
    content: [{ type: 'text', text: '{"lines":[]}' }],
    usage: { input_tokens: INPUT_TOKENS, output_tokens: OUTPUT_TOKENS },
  });

  posts = [];
  resolveNextPost = undefined;
  recordStatus = 200;
  server = aiPillarStandIn();
  process.env['AI_API_URL'] = await listenOnLoopback();

  tmpDir = mkdtempSync(join(tmpdir(), 'purchases-ledger-'));
  const credentialPath = join(tmpDir, 'pops_purchases_ledger_credential');
  // A trailing newline is what an editor and a `docker secret` file both
  // produce; a credential sent with one in it is a different string.
  writeFileSync(credentialPath, `purchases.${LEDGER_SECRET}\n`);
  process.env['POPS_INTERNAL_CREDENTIAL_FILE'] = credentialPath;
  process.env['POPS_INTERNAL_CREDENTIAL'] = INLINE_DECOY;
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['AI_API_URL'];
  delete process.env['POPS_INTERNAL_CREDENTIAL_FILE'];
  delete process.env['POPS_INTERNAL_CREDENTIAL'];
  delete process.env['ANTHROPIC_API_KEY'];
  vi.restoreAllMocks();
});

describe('receipt extraction → the ai pillar usage ledger', () => {
  it('records the call as purchases, priced, with the per-caller credential on the wire', async () => {
    await readOneReceipt();

    const post = await nextPost();
    expect(post.credential).toBe(`purchases.${LEDGER_SECRET}`);
    expect(post.record).toMatchObject({
      domain: 'purchases',
      operation: 'receipt-extraction',
      provider: 'anthropic',
      status: 'success',
      inputTokens: INPUT_TOKENS,
      outputTokens: OUTPUT_TOKENS,
    });
    expect(post.record['costUsd']).toBeCloseTo(
      (INPUT_TOKENS / 1_000_000) * INPUT_PER_MTOK + (OUTPUT_TOKENS / 1_000_000) * OUTPUT_PER_MTOK,
      12
    );
  });

  it('falls back to the inline credential when no file is mounted', async () => {
    delete process.env['POPS_INTERNAL_CREDENTIAL_FILE'];

    await readOneReceipt();

    expect((await nextPost()).credential).toBe(INLINE_DECOY);
  });

  it('reports a failed extraction too, so an error is not free in the ledger', async () => {
    createMock.mockRejectedValue(new Error('anthropic exploded'));

    await expect(readOneReceipt()).rejects.toThrow('anthropic exploded');

    expect((await nextPost()).record).toMatchObject({
      domain: 'purchases',
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe('a record the ai pillar refuses', () => {
  it('is logged naming both halves of the pairing, and never silently dropped', async () => {
    recordStatus = 403;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await readOneReceipt();
    await nextPost();

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('403');
    expect(line).toContain('POPS_INTERNAL_CREDENTIAL_FILE');
    expect(line).toContain('POPS_INTERNAL_SECRET_PURCHASES');
  });

  it('names the caller it presented as without putting the secret in the log', async () => {
    recordStatus = 403;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await readOneReceipt();
    await nextPost();

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain("'purchases'");
    expect(line).not.toContain(LEDGER_SECRET);
  });

  it('does not fail the extraction the caller asked for', async () => {
    recordStatus = 403;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(readOneReceipt()).resolves.toBeUndefined();
  });
});

describe('a record that never reaches the ai pillar', () => {
  it('is logged as a delivery failure, not as a credential the operator should go and fix', async () => {
    // The pillar is down: nothing answered, so nothing refused anything.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await readOneReceipt();

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('AI_API_URL');
    expect(line).toContain('delivery rather than the credential');
    expect(line).not.toContain('refused the record');
    expect(line).not.toContain(LEDGER_SECRET);
  });
});
