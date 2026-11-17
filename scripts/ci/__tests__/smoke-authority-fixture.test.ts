import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  authorityProvisionArgs,
  prepareAuthorityFixture,
  readAuthorityFixture,
} from '../smoke-authority-fixture.mjs';
import { smokeLabel } from '../smoke-image.mjs';

const dockerfile = 'pillars/documents/Dockerfile';
const mounts = ['/data/documents', '/data/documents-upload-guard'];

function owningFixture() {
  const source = readFileSync(resolve(dockerfile), 'utf8');
  const fixture = readAuthorityFixture(dockerfile, smokeLabel(source, 'fixture'), mounts);
  if (!fixture) throw new Error('Documents must declare its isolated smoke authority fixture');
  return fixture;
}

describe('image-owned synthetic authority fixture', () => {
  it('requires an explicit independent mount and refuses paths outside the owning directory', () => {
    expect(() => readAuthorityFixture(dockerfile, '../../package.json', mounts)).toThrow(/belong/u);
    expect(() =>
      readAuthorityFixture(dockerfile, 'smoke-fixture.json', ['/data/documents'])
    ).toThrow(/own declared/u);
    expect(readAuthorityFixture(dockerfile, undefined, mounts)).toBeUndefined();
  });

  it.each(['file', 'directory'])(
    'refuses a harmless %s symlink that resolves outside its owner',
    (kind) => {
      const root = mkdtempSync(resolve('tmp/smoke-fixture-owner-'));
      const owner = join(root, 'owner');
      const outside = join(root, 'outside');
      mkdirSync(owner);
      mkdirSync(outside);
      writeFileSync(join(owner, 'Dockerfile'), 'FROM fixture\n');
      writeFileSync(join(outside, 'fixture.json'), JSON.stringify(owningFixture()));
      try {
        const label = kind === 'file' ? 'fixture.json' : 'linked/fixture.json';
        symlinkSync(
          kind === 'file' ? join(outside, 'fixture.json') : outside,
          join(owner, kind === 'file' ? 'fixture.json' : 'linked')
        );
        expect(() => readAuthorityFixture(join(owner, 'Dockerfile'), label, mounts)).toThrow(
          /resolve within/u
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it('uses the maintained provision command explicitly as the normal image user', () => {
    const fixture = owningFixture();
    expect(fixture.directory).toBe('/data/documents-upload-guard');
    expect(fixture.provisionCommand).toEqual(['node', 'dist/api/uploads/provision-guard.js']);
    const args = authorityProvisionArgs(
      fixture,
      'test-image',
      [{ name: 'synthetic-guard', path: fixture.directory }],
      'synthetic-id'
    );
    expect(args).toContain('synthetic-guard:/data/documents-upload-guard');
    expect(args).toContain('DOCUMENTS_UPLOAD_GUARD_ID=synthetic-id');
    expect(args).not.toContain('--user');
  });

  it('requires both isolated missing/wrong-guard refusals before provisioning the ordinary success case', async () => {
    const fixture = owningFixture();
    const commands: string[][] = [];
    const refusals: { environment: Record<string, string>; names: string[]; status: number }[] = [];
    const positive = [
      { name: 'synthetic-data', path: '/data/documents' },
      { name: 'synthetic-guard', path: '/data/documents-upload-guard' },
    ];
    const environment = await prepareAuthorityFixture({
      fixture,
      image: 'test-image',
      volumes: positive,
      docker: async (args) => {
        commands.push(args);
        return '';
      },
      cleanup: async (args) => {
        commands.push(args);
      },
      refuse: async (env, volumes, status) => {
        refusals.push({ environment: env, names: volumes.map((volume) => volume.name), status });
      },
    });
    expect(refusals).toHaveLength(2);
    expect(refusals.map((refusal) => refusal.status)).toEqual([500, 500]);
    expect(refusals.map((refusal) => refusal.environment)).toEqual([environment, environment]);
    const names = refusals.flatMap((refusal) => refusal.names);
    expect(new Set(names).size).toBe(4);
    expect(names).not.toContain('synthetic-data');
    const provisions = commands.filter((args) => args[0] === 'run');
    expect(provisions).toHaveLength(2);
    expect(provisions[0]).not.toContain(
      `DOCUMENTS_UPLOAD_GUARD_ID=${environment['DOCUMENTS_UPLOAD_GUARD_ID']}`
    );
    expect(provisions[1]).toContain(
      `DOCUMENTS_UPLOAD_GUARD_ID=${environment['DOCUMENTS_UPLOAD_GUARD_ID']}`
    );
    expect(commands.filter((args) => args[0] === 'volume' && args[1] === 'rm')).toHaveLength(4);
  });

  it('does not provision the success case when a refusal proof fails, and cleans every owned volume', async () => {
    const commands: string[][] = [];
    const failure = new Error('unexpected HTTP200');
    await expect(
      prepareAuthorityFixture({
        fixture: owningFixture(),
        image: 'test-image',
        volumes: [{ name: 'positive', path: '/data/documents-upload-guard' }],
        docker: async (args) => {
          commands.push(args);
          return '';
        },
        cleanup: async (args) => {
          commands.push(args);
        },
        refuse: async () => {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    expect(commands.some((args) => args[0] === 'run')).toBe(false);
    expect(commands.filter((args) => args[0] === 'volume' && args[1] === 'rm')).toHaveLength(1);
  });
});
