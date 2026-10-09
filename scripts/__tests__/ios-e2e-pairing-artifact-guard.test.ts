import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatPairingRunLifecycleSummary,
  primaryPairingRunFailure,
  scanPairingArtifacts,
} from '../ios-e2e/pairing-artifact-guard.mjs';

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

  it('reports lifecycle stage and counts before and after issuance without material', () => {
    const beforeIssuance = formatPairingRunLifecycleSummary({
      phase: 'mcp-readiness',
      issuedCount: 0,
      claimedCount: 0,
      completedCount: 0,
      pairedCount: 0,
      scannedRoots: 0,
      totalRoots: 2,
      scannedFiles: 0,
      artifactScan: 'not-run',
      artifactScanStage: null,
    });
    const afterIssuance = formatPairingRunLifecycleSummary({
      phase: 'ios-e2e',
      issuedCount: 1,
      claimedCount: 1,
      completedCount: 1,
      pairedCount: 1,
      scannedRoots: 2,
      totalRoots: 2,
      scannedFiles: 3,
      artifactScan: 'clean',
      artifactScanStage: null,
    });

    expect(beforeIssuance).toBe(
      'ios-e2e: lifecycle failure phase=mcp-readiness issued=0 claims=0 completions=0 paired=0 scannedRoots=0/2 scannedFiles=0 artifactScan=not-run artifactScanStage=none.\n'
    );
    expect(afterIssuance).toBe(
      'ios-e2e: lifecycle failure phase=ios-e2e issued=1 claims=1 completions=1 paired=1 scannedRoots=2/2 scannedFiles=3 artifactScan=clean artifactScanStage=none.\n'
    );
    expect(`${beforeIssuance}${afterIssuance}`).not.toContain(material.code);
    expect(`${beforeIssuance}${afterIssuance}`).not.toContain(material.pairingUrl);
  });

  it('preserves a flow failure when the follow-up artifact scan also fails', () => {
    const flowFailure = new Error('simulator installation failed');
    const artifactFailure = new Error('artifact scan failed');

    expect(primaryPairingRunFailure(flowFailure, artifactFailure)).toBe(flowFailure);
    expect(primaryPairingRunFailure(undefined, artifactFailure)).toBe(artifactFailure);
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

    expect(result).toEqual({
      scannedFiles: 1,
      scannedRoots: 1,
      totalRoots: 1,
      filesWithPairingMaterial: 1,
    });
    expect(JSON.stringify(result)).not.toContain(material.code);
    expect(JSON.stringify(result)).not.toContain(material.pairingUrl);
  });

  it('ignores clearly older artifacts while matching material inside coarse-timestamp files', async () => {
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'pairing-artifact-test-'));
    const olderArtifact = join(scratchDirectory, 'previous-run.log');
    const cleanArtifact = join(scratchDirectory, 'current-run.log');
    const afterMs = Date.now();
    const oldDate = new Date(afterMs - 60_000);
    const coarseTimestampDate = new Date(afterMs - 500);
    await writeFile(olderArtifact, material.code);
    await utimes(olderArtifact, oldDate, oldDate);
    await writeFile(cleanArtifact, material.code);
    await utimes(cleanArtifact, coarseTimestampDate, coarseTimestampDate);

    const result = await scanPairingArtifacts({
      root: scratchDirectory,
      afterMs,
      materials: [material],
    });

    expect(result).toEqual({
      scannedFiles: 1,
      scannedRoots: 1,
      totalRoots: 1,
      filesWithPairingMaterial: 1,
    });
  });

  it('scans the selected simulator log alongside Maestro artifacts without returning matches', async () => {
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'pairing-artifact-test-'));
    const maestroRoot = join(scratchDirectory, 'maestro');
    const simulatorLogRoot = join(scratchDirectory, 'CoreSimulator', 'selected-device');
    const afterMs = Date.now() - 5_000;
    await mkdir(maestroRoot, { recursive: true });
    await mkdir(simulatorLogRoot, { recursive: true });
    await writeFile(join(maestroRoot, 'flow.yaml'), 'pairing completed');
    await writeFile(
      join(simulatorLogRoot, 'system.log'),
      `opened ${encodeURIComponent(material.pairingUrl)}`
    );

    const result = await scanPairingArtifacts({
      root: maestroRoot,
      additionalRoots: [simulatorLogRoot],
      requiredRoots: [maestroRoot, simulatorLogRoot],
      afterMs,
      materials: [material],
    });

    expect(result).toEqual({
      scannedFiles: 2,
      scannedRoots: 2,
      totalRoots: 2,
      filesWithPairingMaterial: 1,
    });
    expect(JSON.stringify(result)).not.toContain(material.code);
    expect(JSON.stringify(result)).not.toContain(material.pairingUrl);
  });

  it('fails when no new file can be scanned from the required simulator log directory', async () => {
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'pairing-artifact-test-'));
    const missingSimulatorLogRoot = join(scratchDirectory, 'CoreSimulator', 'selected-device');
    const emptySimulatorLogRoot = join(scratchDirectory, 'CoreSimulator', 'empty-device');

    await expect(
      scanPairingArtifacts({
        root: scratchDirectory,
        additionalRoots: [missingSimulatorLogRoot],
        requiredRoots: [missingSimulatorLogRoot],
        afterMs: Date.now() - 5_000,
        materials: [material],
      })
    ).rejects.toMatchObject({
      stage: 'required-root-missing',
      scannedRoots: 1,
      totalRoots: 2,
    });
    await mkdir(emptySimulatorLogRoot, { recursive: true });
    await writeFile(join(scratchDirectory, 'maestro.log'), 'flow started');
    await expect(
      scanPairingArtifacts({
        root: scratchDirectory,
        additionalRoots: [emptySimulatorLogRoot],
        requiredRoots: [emptySimulatorLogRoot],
        afterMs: Date.now() - 5_000,
        materials: [material],
      })
    ).rejects.toMatchObject({
      stage: 'required-root-no-new-files',
      scannedFiles: 1,
      scannedRoots: 2,
      totalRoots: 2,
    });
  });
});
