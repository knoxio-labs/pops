import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanPairingArtifacts } from '../ios-e2e/pairing-artifact-guard.mjs';

const material = {
  code: '7QK4-9M2X-P3ND',
  pairingUrl: 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND',
};

describe('pairing artifact guard', () => {
  let scratchDirectory: string | undefined;

  afterEach(async () => {
    if (scratchDirectory !== undefined) await rm(scratchDirectory, { recursive: true });
    scratchDirectory = undefined;
  });

  it('finds exact pairing material in newly written artifact files without returning their contents', async () => {
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'pairing-artifact-test-'));
    const artifactPath = join(scratchDirectory, 'device-simulator.log');
    const afterMs = Date.now() - 5_000;
    await writeFile(artifactPath, `simulator opened ${encodeURIComponent(material.pairingUrl)}`);

    const result = await scanPairingArtifacts({
      root: scratchDirectory,
      afterMs,
      materials: [material],
    });

    expect(result).toEqual({ scannedFiles: 1, filesWithPairingMaterial: 1 });
    expect(JSON.stringify(result)).not.toContain(material.code);
    expect(JSON.stringify(result)).not.toContain(material.pairingUrl);
  });

  it('ignores older artifacts and scans all new plain-text files', async () => {
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'pairing-artifact-test-'));
    const olderArtifact = join(scratchDirectory, 'previous-run.log');
    const cleanArtifact = join(scratchDirectory, 'current-run.log');
    const afterMs = Date.now();
    const oldDate = new Date(afterMs - 60_000);
    await writeFile(olderArtifact, material.code);
    await utimes(olderArtifact, oldDate, oldDate);
    await writeFile(cleanArtifact, 'pairing completed without serialized code');

    const result = await scanPairingArtifacts({
      root: scratchDirectory,
      afterMs,
      materials: [material],
    });

    expect(result).toEqual({ scannedFiles: 1, filesWithPairingMaterial: 0 });
  });
});
