import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverLocalTasks } from '../local-dev/discovery.mjs';

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('run-all client task selection', () => {
  it('excludes client tasks by default and includes them only when opted in', async () => {
    root = mkdtempSync(join(process.cwd(), 'tmp', 'local-dev-clients-'));
    const client = join(root, 'clients', 'ios');
    const pillar = join(root, 'pillars', 'api');
    mkdirSync(client, { recursive: true });
    mkdirSync(pillar, { recursive: true });
    writeFileSync(join(client, 'mise.toml'), '[tasks.test]\nrun = "true"\n');
    writeFileSync(join(pillar, 'mise.toml'), '[tasks.test]\nrun = "true"\n');

    const defaults = await discoverLocalTasks({
      cwd: root,
      taskNames: ['test'],
      verifyTrust: false,
    });
    const optedIn = await discoverLocalTasks({
      cwd: root,
      taskNames: ['test'],
      verifyTrust: false,
      includeClients: true,
    });

    expect(defaults.map((task) => task.unitPath)).toEqual([pillar]);
    expect(optedIn.map((task) => task.unitPath)).toEqual([client, pillar]);
  });
});
