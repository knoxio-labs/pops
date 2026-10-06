import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { vi, describe, expect, it } from 'vitest';

import {
  issueAndOpenPairingLink,
  redactPairingOutput,
  runSimulatorPairing,
  simulatorPairingURL,
} from '../ios-e2e/simulator-pairing.mjs';

const pairing = {
  code: 'SYNTHETIC-PAIR-CODE',
  pairingUrl: 'https://bfm.example.com/devices/pair?code=SYNTHETIC-PAIR-CODE',
  expiresAt: '2026-10-07T00:00:00.000Z',
};

describe('simulatorPairingURL', () => {
  it('carries the pairing link in the native scheme query', () => {
    const url = new URL(simulatorPairingURL(pairing.pairingUrl));

    expect(url.protocol).toBe('pops:');
    expect(url.hostname).toBe('e2e-pairing');
    expect(url.searchParams.get('pairing')).toBe(pairing.pairingUrl);
  });
});

describe('issueAndOpenPairingLink', () => {
  it(
    'keeps pairing material out of captured subprocess output and preserves the exit status',
    { timeout: 10_000 },
    async () => {
      const deviceId = 'F4EF06D4-FD8B-452A-B460-199993ABDCF1';
      const nativeURL = simulatorPairingURL(pairing.pairingUrl);
      const observedLink = vi.fn();
      const output = vi.spyOn(process.stdout, 'write');
      const errorOutput = vi.spyOn(process.stderr, 'write');
      const fetchImpl: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              content: [{ type: 'text', text: JSON.stringify(pairing) }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      const spawnImpl = (_command: string, args: string[], options: SpawnOptions): ChildProcess => {
        const link = args[3];
        if (link === undefined) throw new Error('simctl link was not supplied');
        observedLink(link);
        return spawn(
          process.execPath,
          [
            '-e',
            'process.stdout.write(process.argv[1]); process.stderr.write(process.argv[1]); process.exit(7)',
            link,
          ],
          options
        );
      };

      let exitCode: number;
      try {
        exitCode = await issueAndOpenPairingLink({
          endpoint: 'https://mcp.example.com/mcp',
          token: 'synthetic-test-token',
          deviceId,
          fetchImpl,
          spawnImpl,
        });
      } finally {
        output.mockRestore();
        errorOutput.mockRestore();
      }

      expect(exitCode).toBe(7);
      expect(observedLink).toHaveBeenCalledWith(nativeURL);
      expect(output).not.toHaveBeenCalled();
      expect(errorOutput).not.toHaveBeenCalled();
    }
  );

  it('rejects an invalid simulator identifier before requesting a code', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const exitCode = await issueAndOpenPairingLink({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: 'not-a-simulator',
      fetchImpl,
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('runSimulatorPairing', () => {
  it('rejects an invalid simulator ID before requesting a pairing link', async () => {
    const issuePairingLink = vi.fn(async () => 1);
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: 'not-a-simulator',
      issuePairingLink,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(issuePairingLink).not.toHaveBeenCalled();
    expect(writeStdout).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: selected simulator ID is invalid; no pairing request was sent.\n'
    );
  });

  it('reports a simulator delivery failure without pairing material', async () => {
    const issuePairingLink = vi.fn(async () => 7);
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: 'F4EF06D4-FD8B-452A-B460-199993ABDCF1',
      issuePairingLink,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(7);
    expect(issuePairingLink).toHaveBeenCalledOnce();
    expect(writeStdout).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: pairing code was issued, but simulator link delivery failed (exit 7).\n'
    );
  });
});

describe('redactPairingOutput', () => {
  it('redacts plain and URL-encoded forms', () => {
    const output = `failed ${pairing.code} ${encodeURIComponent(pairing.pairingUrl)}`;

    const redacted = redactPairingOutput(output, [pairing.code, pairing.pairingUrl]);

    expect(redacted).toBe('failed [redacted] [redacted]');
  });
});
