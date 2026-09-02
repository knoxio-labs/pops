import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Snapshot before module-level mutation so the suite restores cleanly even
// when run alongside other tests in the same vitest worker.
const originalNodeEnv = process.env['NODE_ENV'];
const KEY_VARS = ['POPS_API_KEY', 'POPS_INTERNAL_API_KEY', 'POPS_API_KEY_FILE'] as const;
const originalKeyVars = Object.fromEntries(KEY_VARS.map((k) => [k, process.env[k]]));

/** Clear every source `/ready` consults, so a test asserts on what it sets alone. */
function clearKeySources(): void {
  for (const name of KEY_VARS) delete process.env[name];
}
process.env['NODE_ENV'] = 'test';

const { app } = await import('./index.js');

let server: HttpServer;
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  // Every test below toggles a key source — reset to the snapshot per-test so
  // the next one starts from the same baseline regardless of which ran last
  // (or whether one threw mid-assert). All three are restored, not just
  // POPS_API_KEY: `/ready` consults the file and the internal var too.
  for (const name of KEY_VARS) {
    const original = originalKeyVars[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = originalNodeEnv;
});

describe('GET /health', () => {
  it('returns 200 with status ok regardless of API key configuration', async () => {
    clearKeySources();
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; tools: number };
    expect(body.status).toBe('ok');
    expect(body.tools).toBeGreaterThan(0);
  });
});

describe('GET /ready', () => {
  it('returns 200 ready when POPS_API_KEY is configured', async () => {
    clearKeySources();
    process.env['POPS_API_KEY'] = 'sa_test';
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      apiKeyConfigured: boolean;
      tools: number;
    };
    expect(body.status).toBe('ready');
    expect(body.apiKeyConfigured).toBe(true);
    expect(body.tools).toBeGreaterThan(0);
  });

  it('returns 503 degraded when POPS_API_KEY is missing', async () => {
    clearKeySources();
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; apiKeyConfigured: boolean };
    expect(body.status).toBe('degraded');
    expect(body.apiKeyConfigured).toBe(false);
  });
});

// The production container sets neither key variable — it mounts a Docker
// secret and names it in POPS_API_KEY_FILE. `/ready` reporting `degraded`
// against a perfectly good mounted secret would make the healthcheck this
// route now backs (POPS-2760) flap the container on every roll.
describe('GET /ready — the production shape, a mounted secret file', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pops-mcp-ready-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is ready when only POPS_API_KEY_FILE is set and the file is readable', async () => {
    clearKeySources();
    const path = join(dir, 'pops_api_key');
    writeFileSync(path, 'pops_sa_live.abc123\n');
    process.env['POPS_API_KEY_FILE'] = path;

    const res = await fetch(`${baseUrl}/ready`);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ready');
  });

  it('is degraded when POPS_API_KEY_FILE points at a file it cannot read', async () => {
    clearKeySources();
    process.env['POPS_API_KEY_FILE'] = join(dir, 'does-not-exist');

    const res = await fetch(`${baseUrl}/ready`);

    expect(res.status).toBe(503);
    expect(((await res.json()) as { status: string }).status).toBe('degraded');
  });
});
