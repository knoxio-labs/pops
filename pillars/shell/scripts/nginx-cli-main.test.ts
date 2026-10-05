import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { runDynamic } from './nginx-cli-main.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TEMP_ROOT = join(REPO_ROOT, 'tmp');

async function withOutputPath(run: (outputPath: string) => Promise<void>): Promise<void> {
  await mkdir(TEMP_ROOT, { recursive: true });
  const directory = await mkdtemp(join(TEMP_ROOT, 'shell-dynamic-render-'));
  try {
    await run(join(directory, 'default.conf'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('runDynamic', () => {
  it('retries a failed registry render and writes the first successful config', async () => {
    await withOutputPath(async (outputPath) => {
      let attempts = 0;
      const waitBeforeRetry = vi.fn(async () => undefined);
      const render = vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('registry unavailable');
        return 'server { listen 80; }';
      });

      await runDynamic({
        outputPath,
        registryUrl: 'http://registry-api:3001',
        render,
        waitBeforeRetry,
      });

      expect(render).toHaveBeenCalledTimes(2);
      expect(render).toHaveBeenCalledWith('http://registry-api:3001');
      expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
      expect(waitBeforeRetry).toHaveBeenCalledWith(1_000);
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('server { listen 80; }');
    });
  });

  it('stops after three failed renders and does not replace the output', async () => {
    await withOutputPath(async (outputPath) => {
      await writeFile(outputPath, 'fallback config', 'utf8');
      const error = new Error('registry unavailable');
      const waitBeforeRetry = vi.fn(async () => undefined);
      const render = vi.fn(async () => {
        throw error;
      });

      await expect(
        runDynamic({
          outputPath,
          registryUrl: 'http://registry-api:3001',
          render,
          waitBeforeRetry,
        })
      ).rejects.toBe(error);

      expect(render).toHaveBeenCalledTimes(3);
      expect(waitBeforeRetry).toHaveBeenCalledTimes(2);
      await expect(readFile(outputPath, 'utf8')).resolves.toBe('fallback config');
    });
  });
});
