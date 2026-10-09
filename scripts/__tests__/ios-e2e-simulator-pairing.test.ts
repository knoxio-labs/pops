import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { vi, describe, expect, it } from 'vitest';

import { PairingArtifactScanFailure } from '../ios-e2e/pairing-artifact-guard.mjs';
import { createPairingHandoff } from '../ios-e2e/pairing-handoff.mjs';
import {
  issueAndOpenPairingLink,
  runSimctlOpenURL,
  runSimulatorPairing,
  simulatorPairingURL,
} from '../ios-e2e/simulator-pairing.mjs';

const pairing = {
  code: '7QK4-9M2X-P3ND',
  pairingUrl: 'https://bfm.example.com/devices/pair?code=7QK4-9M2X-P3ND',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const simulatorId = '11111111-1111-4111-8111-111111111111';
const wrongSimulatorId = '33333333-3333-4333-8333-333333333333';
const maestroRoot = resolve(fileURLToPath(new URL('../../clients/ios/.maestro/', import.meta.url)));
const pairingScriptPath = fileURLToPath(
  new URL('../../clients/ios/.maestro/scripts/pair-this-simulator.js', import.meta.url)
);
const pairingCompletionScriptPath = fileURLToPath(
  new URL('../../clients/ios/.maestro/scripts/await-simulator-pairing.js', import.meta.url)
);
const pairingSubflowPath = fileURLToPath(
  new URL('../../clients/ios/.maestro/subflows/enter-the-pairing-details.yaml', import.meta.url)
);
const stalePromptSubflowPath = fileURLToPath(
  new URL(
    '../../clients/ios/.maestro/subflows/dismiss-stale-pairing-open-prompt.yaml',
    import.meta.url
  )
);
const iosTasksPath = fileURLToPath(new URL('../../clients/ios/mise.toml', import.meta.url));

async function maestroYamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return maestroYamlFiles(path);
      return entry.isFile() && entry.name.endsWith('.yaml') ? [path] : [];
    })
  );
  return nestedPaths.flat();
}

function pairingResponse(): Response {
  return new Response(JSON.stringify(pairing), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

function spawnExit(
  exitStatus: number,
  observed: string[][]
): (command: string, args: string[], options: SpawnOptions) => ChildProcess {
  return (_command, args, options) => {
    observed.push(args);
    return spawn(process.execPath, ['-e', `process.exit(${exitStatus})`], options);
  };
}

describe('simulatorPairingURL', () => {
  it('contains only loopback broker and public simulator generation metadata', () => {
    const instanceId = '12345-1800000000000-2';
    const trigger = new URL(
      simulatorPairingURL({
        brokerUrl: 'http://127.0.0.1:3011',
        deviceId: simulatorId,
        instanceId,
        generation: 3,
      })
    );

    expect(trigger.protocol).toBe('pops:');
    expect(trigger.hostname).toBe('e2e-pairing');
    expect(trigger.searchParams.get('broker')).toBe('http://127.0.0.1:3011');
    expect(trigger.searchParams.get('deviceId')).toBe(simulatorId);
    expect(trigger.searchParams.get('instanceId')).toBe(instanceId);
    expect(trigger.searchParams.get('generation')).toBe('3');
    expect([...trigger.searchParams.keys()].toSorted()).toEqual([
      'broker',
      'deviceId',
      'generation',
      'instanceId',
    ]);
    expect(trigger.href).not.toContain('pairing=');
    expect(trigger.href).not.toContain('code=');
  });

  it('rejects a non-loopback broker, missing port, URL path, and invalid target before opening', () => {
    const valid = {
      brokerUrl: 'http://127.0.0.1:3011',
      deviceId: simulatorId,
      instanceId: '12345-1800000000000-2',
      generation: 3,
    };
    for (const brokerUrl of [
      'http://localhost:3011',
      'http://127.0.0.1',
      'http://127.0.0.1:3011/elsewhere',
      'https://127.0.0.1:3011',
    ]) {
      expect(() => simulatorPairingURL({ ...valid, brokerUrl })).toThrow(
        'ios-e2e simulator pairing trigger is invalid.'
      );
    }
    expect(() => simulatorPairingURL({ ...valid, deviceId: 'not-a-simulator' })).toThrow(
      'ios-e2e simulator pairing trigger is invalid.'
    );
    expect(() => simulatorPairingURL({ ...valid, generation: 0 })).toThrow(
      'ios-e2e simulator pairing trigger is invalid.'
    );
    expect(() => simulatorPairingURL({ ...valid, instanceId: 'opaque' })).toThrow(
      'ios-e2e simulator pairing trigger is invalid.'
    );
  });
});

describe('issueAndOpenPairingLink', { timeout: 30_000 }, () => {
  it('keeps issued pairing details in the host handoff and sends only a non-secret trigger', async () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId });
    const argsSeen: string[][] = [];
    const fetchImpl: typeof fetch = async () => pairingResponse();
    const exitCode = await issueAndOpenPairingLink({
      issuer: 'direct',
      endpoint: 'http://127.0.0.1:3000',
      pairingBaseUrl: 'http://127.0.0.1:3001',
      brokerUrl: 'http://127.0.0.1:3011',
      handoff,
      deviceId: simulatorId,
      fetchImpl,
      spawnImpl: spawnExit(0, argsSeen),
    });

    const argsText = JSON.stringify(argsSeen);
    const trigger = new URL(String(argsSeen[0]?.[3]));
    const instanceId = String(trigger.searchParams.get('instanceId'));
    const generation = Number(trigger.searchParams.get('generation'));
    expect(exitCode).toBe(0);
    expect(argsSeen[0]?.slice(0, 3)).toEqual(['simctl', 'openurl', simulatorId]);
    expect(argsText).not.toContain(pairing.code);
    expect(argsText).not.toContain(encodeURIComponent(pairing.code));
    expect(argsText).not.toContain(pairing.pairingUrl);
    expect(generation).toBe(1);
    expect(
      handoff.claim({
        deviceId: wrongSimulatorId,
        instanceId,
        generation,
      })
    ).toBeNull();

    const staleClaim = handoff.claim({
      deviceId: simulatorId,
      instanceId,
      generation: generation + 1,
    });
    expect(staleClaim).toBeNull();

    const claimed = handoff.claim({ deviceId: simulatorId, instanceId, generation });
    expect(claimed).toEqual({
      deviceId: simulatorId,
      instanceId,
      generation,
      pairingBaseUrl: 'http://127.0.0.1:3001',
      code: pairing.code,
      expiresAt: pairing.expiresAt,
    });
    expect(handoff.claim({ deviceId: simulatorId, instanceId, generation })).toBeNull();
  });

  it('does not open a trigger for issuance errors or mismatched response codes', async () => {
    const secret = pairing.code;
    const spawnImpl =
      vi.fn<(command: string, args: string[], options: SpawnOptions) => ChildProcess>();
    const responses = [
      {
        response: new Response(JSON.stringify({ pairing: secret }), { status: 503 }),
        error: 'direct pairing request failed',
      },
      {
        response: new Response(
          JSON.stringify({ code: secret, pairingUrl: pairing.pairingUrl, expiresAt: 'never' }),
          { status: 201 }
        ),
        error: 'pairing response was invalid',
      },
    ];

    for (const testCase of responses) {
      await expect(
        issueAndOpenPairingLink({
          issuer: 'direct',
          endpoint: 'http://127.0.0.1:3000',
          brokerUrl: 'http://127.0.0.1:3011',
          handoff: createPairingHandoff({ deviceId: simulatorId }),
          deviceId: simulatorId,
          fetchImpl: async () => testCase.response,
          spawnImpl,
        })
      ).rejects.toThrow(testCase.error);
    }

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('does not deliver a live pairing link from an unexpected BFM origin', async () => {
    const onPairingIssued = vi.fn();
    const spawnImpl =
      vi.fn<(command: string, args: string[], options: SpawnOptions) => ChildProcess>();

    await expect(
      issueAndOpenPairingLink({
        issuer: 'direct',
        endpoint: 'https://bfm.example.com',
        expectedPairingOrigin: 'https://other.example.com',
        brokerUrl: 'http://127.0.0.1:3011',
        handoff: createPairingHandoff({ deviceId: simulatorId }),
        deviceId: simulatorId,
        onPairingIssued,
        fetchImpl: async () => pairingResponse(),
        spawnImpl,
      })
    ).rejects.toThrow('pairing response was invalid');

    expect(onPairingIssued).toHaveBeenCalledWith({
      code: pairing.code,
      pairingUrl: pairing.pairingUrl,
    });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('clears the handoff when simctl rejects delivery', async () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId });
    const argsSeen: string[][] = [];
    const exitCode = await issueAndOpenPairingLink({
      issuer: 'direct',
      endpoint: 'http://127.0.0.1:3000',
      brokerUrl: 'http://127.0.0.1:3011',
      handoff,
      deviceId: simulatorId,
      fetchImpl: async () => pairingResponse(),
      spawnImpl: spawnExit(7, argsSeen),
    });
    const trigger = new URL(String(argsSeen[0]?.[3]));

    expect(exitCode).toBe(7);
    expect(
      handoff.claim({
        deviceId: simulatorId,
        instanceId: String(trigger.searchParams.get('instanceId')),
        generation: Number(trigger.searchParams.get('generation')),
      })
    ).toBeNull();
  });

  it('rejects invalid simulator identity before issuing a code', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const handoff = createPairingHandoff({ deviceId: simulatorId });
    const spawnImpl =
      vi.fn<(command: string, args: string[], options: SpawnOptions) => ChildProcess>();

    const exitCode = await issueAndOpenPairingLink({
      endpoint: 'https://mcp.example.com/mcp',
      brokerUrl: 'http://127.0.0.1:3011',
      handoff,
      deviceId: 'not-a-simulator',
      fetchImpl,
      spawnImpl,
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});

describe('runSimctlOpenURL', { timeout: 30_000 }, () => {
  it('discards simulator command output and never places the pairing link in a captured stream', async () => {
    const link = 'pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011';
    const output = vi.spyOn(process.stdout, 'write');
    const errorOutput = vi.spyOn(process.stderr, 'write');
    const optionsSeen: SpawnOptions[] = [];
    const spawnImpl = (_command: string, _args: string[], options: SpawnOptions): ChildProcess => {
      optionsSeen.push(options);
      return spawn(
        process.execPath,
        [
          '-e',
          'process.stdout.write(process.argv[1]); process.stderr.write(process.argv[1])',
          link,
        ],
        options
      );
    };

    try {
      expect(await runSimctlOpenURL(simulatorId, link, spawnImpl)).toBe(0);
      expect(optionsSeen[0]?.stdio).toBe('ignore');
      expect(output).not.toHaveBeenCalled();
      expect(errorOutput).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
      errorOutput.mockRestore();
    }
  });
});

describe('runSimulatorPairing', { timeout: 30_000 }, () => {
  it('rejects an invalid simulator ID before opening a broker or requesting a pairing link', async () => {
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

  it.each([
    'http://bfm.example.com',
    'https://bfm.example.com/mobile',
    'https://user:password@bfm.example.com',
    'https://bfm.example.com?next=/devices/pair',
  ])('rejects an invalid expected BFM origin before issuing a live code: %s', async (origin) => {
    const issuePairingLink = vi.fn(async () => 0);
    const writeStderr = vi.fn();

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: simulatorId,
      expectedPairingOrigin: origin,
      issuePairingLink,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(issuePairingLink).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: a credential-free HTTPS BFM origin is required for live simulator pairing.\n'
    );
  });

  it('waits for the exact selected simulator to store a session before reporting success', async () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    const scanArtifacts = vi.fn(
      async ({
        deviceId,
        materials,
      }: {
        deviceId: string;
        materials: Array<{ code: string; pairingUrl: string }>;
      }) => {
        expect(deviceId).toBe(simulatorId);
        expect(materials).toEqual([{ code: pairing.code, pairingUrl: pairing.pairingUrl }]);
        return {
          scannedFiles: 2,
          scannedRoots: 1,
          totalRoots: 2,
          filesWithPairingMaterial: 0,
        };
      }
    );
    const issuePairingLink = vi.fn(
      async ({
        brokerUrl,
        deviceId,
        expectedPairingOrigin,
        handoff,
        onPairingIssued,
      }: {
        brokerUrl: string;
        deviceId: string;
        expectedPairingOrigin: string;
        handoff: ReturnType<typeof createPairingHandoff>;
        onPairingIssued: (material: { code: string; pairingUrl: string }) => void;
      }) => {
        expect(expectedPairingOrigin).toBe('https://bfm.example.com');
        onPairingIssued({ code: pairing.code, pairingUrl: pairing.pairingUrl });
        const generation = handoff.offer({
          deviceId,
          pairingBaseUrl: 'https://bfm.example.com',
          code: pairing.code,
          expiresAt: pairing.expiresAt,
        });
        const response = await fetch(`${brokerUrl}/__e2e/pair/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId, instanceId: handoff.instanceId, generation }),
        });
        expect(response.status).toBe(200);
        const completion = await fetch(`${brokerUrl}/__e2e/pair/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            instanceId: handoff.instanceId,
            generation,
            paired: true,
          }),
        });
        expect(completion.status).toBe(204);
        return 0;
      }
    );

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: simulatorId,
      expectedPairingOrigin: 'https://bfm.example.com',
      issuePairingLink,
      scanArtifacts,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(0);
    expect(scanArtifacts).toHaveBeenCalledOnce();
    expect(writeStdout).toHaveBeenCalledWith(
      'ios-e2e: pairing artifact scan roots=1/2 files=2 matches=0.\n'
    );
    expect(writeStdout).toHaveBeenCalledWith('ios-e2e: simulator stored a session for this BFM.\n');
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it('reports delivery failure without pairing material', async () => {
    const issuePairingLink = vi.fn(
      async ({
        onPairingIssued,
      }: {
        onPairingIssued: (material: { code: string; pairingUrl: string }) => void;
      }) => {
        onPairingIssued({ code: pairing.code, pairingUrl: pairing.pairingUrl });
        return 7;
      }
    );
    const scanArtifacts = vi.fn(
      async ({ materials }: { materials: Array<{ code: string; pairingUrl: string }> }) => {
        expect(materials).toEqual([{ code: pairing.code, pairingUrl: pairing.pairingUrl }]);
        return {
          scannedFiles: 2,
          scannedRoots: 1,
          totalRoots: 2,
          filesWithPairingMaterial: 0,
        };
      }
    );
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: simulatorId,
      expectedPairingOrigin: 'https://bfm.example.com',
      issuePairingLink,
      scanArtifacts,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(issuePairingLink).toHaveBeenCalledOnce();
    expect(scanArtifacts).toHaveBeenCalledOnce();
    expect(writeStdout).toHaveBeenCalledWith(
      'ios-e2e: pairing artifact scan roots=1/2 files=2 matches=0.\n'
    );
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: pairing code was issued, but simulator link delivery failed (exit 7). No retry was attempted.\n'
    );
  });

  it('fails closed when the selected simulator log scan finds pairing material', async () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    const issuePairingLink = vi.fn(
      async ({
        brokerUrl,
        deviceId,
        handoff,
        onPairingIssued,
      }: {
        brokerUrl: string;
        deviceId: string;
        handoff: ReturnType<typeof createPairingHandoff>;
        onPairingIssued: (material: { code: string; pairingUrl: string }) => void;
      }) => {
        onPairingIssued({ code: pairing.code, pairingUrl: pairing.pairingUrl });
        const generation = handoff.offer({
          deviceId,
          pairingBaseUrl: 'https://bfm.example.com',
          code: pairing.code,
          expiresAt: pairing.expiresAt,
        });
        const response = await fetch(`${brokerUrl}/__e2e/pair/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId, instanceId: handoff.instanceId, generation }),
        });
        expect(response.status).toBe(200);
        const completion = await fetch(`${brokerUrl}/__e2e/pair/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            instanceId: handoff.instanceId,
            generation,
            paired: true,
          }),
        });
        expect(completion.status).toBe(204);
        return 0;
      }
    );
    const scanArtifacts = vi.fn(
      async ({
        deviceId,
        materials,
      }: {
        deviceId: string;
        materials: Array<{ code: string; pairingUrl: string }>;
      }) => {
        expect(deviceId).toBe(simulatorId);
        expect(materials).toEqual([{ code: pairing.code, pairingUrl: pairing.pairingUrl }]);
        return {
          scannedFiles: 1,
          scannedRoots: 1,
          totalRoots: 2,
          filesWithPairingMaterial: 1,
        };
      }
    );

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: simulatorId,
      expectedPairingOrigin: 'https://bfm.example.com',
      issuePairingLink,
      scanArtifacts,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(writeStdout).toHaveBeenCalledWith(
      'ios-e2e: pairing artifact scan roots=1/2 files=1 matches=1.\n'
    );
    expect(writeStdout).not.toHaveBeenCalledWith(
      'ios-e2e: simulator stored a session for this BFM.\n'
    );
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: pairing material was found in a selected-simulator artifact; pairing may already be active. No retry was attempted.\n'
    );
    const output = JSON.stringify([writeStdout.mock.calls, writeStderr.mock.calls]);
    expect(output).not.toContain(pairing.code);
    expect(output).not.toContain(pairing.pairingUrl);
  });

  it('fails closed and emits no pairing material when the artifact scan cannot complete', async () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    const issuePairingLink = vi.fn(
      async ({
        onPairingIssued,
      }: {
        onPairingIssued: (material: { code: string; pairingUrl: string }) => void;
      }) => {
        onPairingIssued({ code: pairing.code, pairingUrl: pairing.pairingUrl });
        return 7;
      }
    );
    const scanArtifacts = vi.fn(async () => {
      throw new PairingArtifactScanFailure('root-read-failed', 0, 0, 2);
    });

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://mcp.example.com/mcp',
      deviceId: simulatorId,
      expectedPairingOrigin: 'https://bfm.example.com',
      issuePairingLink,
      scanArtifacts,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(issuePairingLink).toHaveBeenCalledOnce();
    expect(scanArtifacts).toHaveBeenCalledOnce();
    expect(writeStderr).toHaveBeenCalledWith(
      'ios-e2e: selected simulator artifact scan failed at root-read-failed; pairing may already be active. No retry was attempted.\n'
    );
    const output = JSON.stringify([writeStdout.mock.calls, writeStderr.mock.calls]);
    expect(output).not.toContain(pairing.code);
    expect(output).not.toContain(pairing.pairingUrl);
  });

  it('scans issued material before rejecting an unexpected origin without opening the link', async () => {
    const spawnImpl =
      vi.fn<(command: string, args: string[], options: SpawnOptions) => ChildProcess>();
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    const scanArtifacts = vi.fn(
      async ({ materials }: { materials: Array<{ code: string; pairingUrl: string }> }) => {
        expect(materials).toEqual([{ code: pairing.code, pairingUrl: pairing.pairingUrl }]);
        return {
          scannedFiles: 2,
          scannedRoots: 1,
          totalRoots: 2,
          filesWithPairingMaterial: 0,
        };
      }
    );
    const issuePairingLink = (options: {
      endpoint: string;
      expectedPairingOrigin: string;
      brokerUrl: string;
      handoff: ReturnType<typeof createPairingHandoff>;
      deviceId: string;
      onPairingIssued: (material: { code: string; pairingUrl: string }) => void;
    }) =>
      issueAndOpenPairingLink({
        ...options,
        issuer: 'direct',
        fetchImpl: async () => pairingResponse(),
        spawnImpl,
      });

    const exitCode = await runSimulatorPairing({
      endpoint: 'https://bfm.example.com',
      deviceId: simulatorId,
      expectedPairingOrigin: 'https://unexpected.example.com',
      issuePairingLink,
      scanArtifacts,
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(scanArtifacts).toHaveBeenCalledOnce();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(writeStdout).toHaveBeenCalledWith(
      'ios-e2e: pairing artifact scan roots=1/2 files=2 matches=0.\n'
    );
    const output = JSON.stringify([writeStdout.mock.calls, writeStderr.mock.calls]);
    expect(output).not.toContain(pairing.code);
    expect(output).not.toContain(pairing.pairingUrl);
  });
});

describe('Maestro pairing flows', () => {
  it('uses the private handoff without putting a pairing code in Maestro sources or arguments', async () => {
    const flowPaths = await maestroYamlFiles(maestroRoot);
    const [pairingScript, pairingCompletionScript, pairingSubflow, stalePromptSubflow, iosTasks] =
      await Promise.all([
        readFile(pairingScriptPath, 'utf8'),
        readFile(pairingCompletionScriptPath, 'utf8'),
        readFile(pairingSubflowPath, 'utf8'),
        readFile(stalePromptSubflowPath, 'utf8'),
        readFile(iosTasksPath, 'utf8'),
      ]);

    expect(flowPaths.length).toBeGreaterThan(0);
    const rootFlowPaths = flowPaths.filter((flowPath) => dirname(flowPath) === maestroRoot);
    expect(rootFlowPaths.length).toBeGreaterThan(0);
    for (const flowPath of flowPaths) {
      const flow = await readFile(flowPath, 'utf8');
      expect(flow).not.toContain('PAIRING_CODE');
      expect(flow).not.toContain('inputText: ${output.pairing');
    }
    for (const flowPath of rootFlowPaths) {
      const flow = await readFile(flowPath, 'utf8');
      const stalePromptGuard = flow.indexOf(
        'runFlow: subflows/dismiss-stale-pairing-open-prompt.yaml'
      );
      const pairingScreenAssertion = flow.indexOf("id: 'pairing-code-field'");
      expect(stalePromptGuard).toBeGreaterThanOrEqual(0);
      expect(pairingScreenAssertion).toBeGreaterThan(stalePromptGuard);
    }
    expect(pairingScript).toContain("'/__e2e/pair'");
    expect(pairingScript).toContain('output.pairingTrigger = { dispatched: true }');
    expect(pairingScript).not.toContain('PAIRING_CODE');
    expect(pairingCompletionScript).toContain("'/__e2e/pair/status'");
    expect(pairingCompletionScript).toContain('output.pairing = { paired: true }');
    expect(pairingCompletionScript).not.toContain('PAIRING_CODE');
    expect(pairingSubflow).toContain('file: ../scripts/pair-this-simulator.js');
    expect(pairingSubflow).toContain('file: ../scripts/await-simulator-pairing.js');
    expect(pairingSubflow).toContain("visible: 'Open in “Pops Local”\\?'");
    expect(pairingSubflow).toContain('- tapOn: Open');
    expect(pairingSubflow).not.toContain('inputText');
    expect(stalePromptSubflow).toContain("visible: 'Open in “Pops Local”\\?'");
    expect(stalePromptSubflow).toContain('- tapOn: Cancel');
    expect(iosTasks).toContain('POPS_IOS_PAIRING_EXPECTED_BFM_ORIGIN');
    expect(iosTasks).toContain('pops-mcp-headers');
    expect(iosTasks).toContain('MCP_INBOUND_TOKEN="$token"');
    expect(iosTasks).toContain('node ../../scripts/ios-e2e/simulator-pairing.mjs');
    expect(iosTasks).not.toContain('PAIRING_CODE');
  });

  it('keeps trigger dispatch separate from the session completion status', async () => {
    const script = await readFile(pairingScriptPath, 'utf8');
    const code = pairing.code;
    const controlUrl = 'http://127.0.0.1:3011';
    const serverUrl = 'http://127.0.0.1:3012';

    for (const status of [202, 200, 502]) {
      const output: Record<string, unknown> = {};
      const requests: Array<{ url: string; body: string }> = [];
      const run = () =>
        runInNewContext(script, {
          CONTROL_BASE_URL: controlUrl,
          SERVER_URL: serverUrl,
          SIMULATOR_UDID: simulatorId,
          http: {
            post(url: string, options: { body: string }) {
              requests.push({ url, body: options.body });
              return { status, body: JSON.stringify({ triggerDispatched: true }) };
            },
          },
          json: (body: string) => JSON.parse(body),
          output,
        });

      if (status === 202) {
        run();
        expect(output).toEqual({ pairingTrigger: { dispatched: true } });
      } else {
        expect(run).toThrow('native simulator pairing trigger was not dispatched');
        expect(output).toEqual({});
      }

      expect(requests).toEqual([
        {
          url: `${controlUrl}/__e2e/pair`,
          body: JSON.stringify({ deviceId: simulatorId, pairingBaseUrl: serverUrl }),
        },
      ]);
      const serialized = JSON.stringify({ output, requests });
      expect(serialized).not.toContain(code);
      expect(serialized).not.toContain(pairing.pairingUrl);
    }
  });

  it('reports pairing completion only after the control plane returns the stored-session result', async () => {
    const script = await readFile(pairingCompletionScriptPath, 'utf8');
    const code = pairing.code;
    const controlUrl = 'http://127.0.0.1:3011';
    const responses = [
      { status: 200, body: JSON.stringify({ paired: true }) },
      { status: 502, body: JSON.stringify({ message: 'pairing failed' }) },
    ];

    for (const response of responses) {
      const output: Record<string, unknown> = {};
      const requests: Array<{ url: string; body: string }> = [];
      const run = () =>
        runInNewContext(script, {
          CONTROL_BASE_URL: controlUrl,
          SIMULATOR_UDID: simulatorId,
          http: {
            post(url: string, options: { body: string }) {
              requests.push({ url, body: options.body });
              return response;
            },
          },
          json: (body: string) => JSON.parse(body),
          output,
        });

      if (response.status === 200) {
        run();
        expect(output).toEqual({ pairing: { paired: true } });
      } else {
        expect(run).toThrow('native simulator pairing did not store a session');
        expect(output).toEqual({});
      }

      expect(requests).toEqual([
        {
          url: `${controlUrl}/__e2e/pair/status`,
          body: JSON.stringify({ deviceId: simulatorId }),
        },
      ]);
      expect(JSON.stringify({ output, requests })).not.toContain(code);
    }
  });
});
