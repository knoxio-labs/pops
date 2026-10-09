import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const processRunnerUrl = new URL('../ios-e2e/process-runner.mjs', import.meta.url).href;
const artifactGuardUrl = new URL('../ios-e2e/pairing-artifact-guard.mjs', import.meta.url).href;

describe('iOS E2E process runner', { timeout: 12_000 }, () => {
  let scratchDirectory: string | undefined;
  let ownedProcessGroupId: number | undefined;

  afterEach(async () => {
    if (ownedProcessGroupId !== undefined) {
      try {
        process.kill(-ownedProcessGroupId, 'SIGKILL');
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
      }
      ownedProcessGroupId = undefined;
    }
    if (scratchDirectory !== undefined)
      await rm(scratchDirectory, { recursive: true, force: true });
    scratchDirectory = undefined;
  });

  it('scans and cleans up after an interrupted command tree before exiting', async () => {
    await mkdir(join(process.cwd(), 'tmp'), { recursive: true });
    scratchDirectory = await mkdtemp(join(process.cwd(), 'tmp', 'ios-e2e-process-runner-'));
    const maestroRoot = join(scratchDirectory, 'maestro');
    const simulatorRoot = join(scratchDirectory, 'simulator');
    const childPidPath = join(scratchDirectory, 'child.pid');
    const processGroupPath = join(scratchDirectory, 'process-group.id');
    await mkdir(maestroRoot);
    await mkdir(simulatorRoot);
    await writeFile(join(maestroRoot, 'commands.json'), 'flow completed');
    await writeFile(join(simulatorRoot, 'system.log'), 'pairing completed');

    const ownedCommandSource = [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)")}]);`,
      `writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid));`,
      `writeFileSync(${JSON.stringify(processGroupPath)}, String(process.pid));`,
      "process.on('SIGTERM', () => process.exit(0));",
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const fixtureSource = `
      import { readFile, rm } from 'node:fs/promises';
      import { join } from 'node:path';
      import { createProcessRunner } from ${JSON.stringify(processRunnerUrl)};
      import { formatPairingRunLifecycleSummary, scanPairingArtifacts } from ${JSON.stringify(artifactGuardUrl)};

      const root = ${JSON.stringify(scratchDirectory)};
      const runner = createProcessRunner({ graceMs: 100 });
      const childPidPath = join(root, 'child.pid');
      const ownedCommand = ${JSON.stringify(ownedCommandSource)};

      try {
        const result = await runner.run(process.execPath, ['-e', ownedCommand]);
        if (result.code !== 0 || runner.signal() !== null) throw new Error('owned command did not stop after interruption');
      } catch {
        const childPid = await readFile(childPidPath, 'utf8');
        const scan = await scanPairingArtifacts({
          root: join(root, 'maestro'),
          additionalRoots: [join(root, 'simulator')],
          requiredRoots: [join(root, 'maestro'), join(root, 'simulator')],
          afterMs: Date.now() - 5_000,
          materials: [{ code: 'TEST-PAIRING-MATERIAL', pairingUrl: 'http://127.0.0.1/pair?code=TEST-PAIRING-MATERIAL' }],
        });
        process.stdout.write('owned-child-pid=' + childPid.trim() + '\\n');
        process.stdout.write(formatPairingRunLifecycleSummary({
          phase: 'ios-e2e',
          issuedCount: 1,
          claimedCount: 0,
          completedCount: 0,
          pairedCount: 0,
          scannedRoots: scan.scannedRoots,
          totalRoots: scan.totalRoots,
          scannedFiles: scan.scannedFiles,
          artifactScan: scan.filesWithPairingMaterial === 0 ? 'clean' : 'matched',
          artifactScanStage: null,
        }));
      } finally {
        await runner.close();
        await rm(root, { recursive: true, force: true });
        process.stdout.write('fixture: teardown complete\\n');
        if (runner.signal() !== null) process.exitCode = 143;
      }
    `;
    const fixture = spawn(process.execPath, ['--input-type=module', '-e', fixtureSource], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    fixture.stdout.setEncoding('utf8');
    fixture.stderr.setEncoding('utf8');
    fixture.stdout.on('data', (chunk: string) => (output += chunk));
    fixture.stderr.on('data', (chunk: string) => (output += chunk));

    const deadline = Date.now() + 5_000;
    while (!existsSync(childPidPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(existsSync(childPidPath)).toBe(true);
    const ownedChildPid = Number(await readFile(childPidPath, 'utf8'));
    ownedProcessGroupId = Number(await readFile(processGroupPath, 'utf8'));
    fixture.kill('SIGTERM');
    const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
      fixture.once('close', (exitCode, exitSignal) => resolve([exitCode, exitSignal]));
    });

    expect(code).toBe(143);
    expect(signal).toBeNull();
    expect(output).toContain(
      'ios-e2e: lifecycle failure phase=ios-e2e issued=1 claims=0 completions=0 paired=0 scannedRoots=2/2 scannedFiles=2 artifactScan=clean artifactScanStage=none.'
    );
    expect(output.indexOf('ios-e2e: lifecycle failure')).toBeLessThan(
      output.indexOf('fixture: teardown complete')
    );
    expect(output).not.toContain('TEST-PAIRING-MATERIAL');
    expect(existsSync(scratchDirectory)).toBe(false);

    const childState = spawnSync('ps', ['-o', 'stat=', '-p', String(ownedChildPid)], {
      encoding: 'utf8',
    }).stdout.trim();
    expect(childState === '' || childState.startsWith('Z')).toBe(true);
  });
});
