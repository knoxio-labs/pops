import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initContract } from '@ts-rest/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildPillarOpenApiDocument,
  type PillarOpenApiProjection,
} from '../write-pillar-openapi.js';

const c = initContract();

const flatContract = c.router({
  getThing: {
    method: 'GET',
    path: '/things/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ id: z.string(), label: z.string() }) },
  },
});

interface TreeNode {
  name: string;
  children: TreeNode[];
}

const treeNodeSchema: z.ZodType<TreeNode> = z
  .lazy(() => z.object({ name: z.string(), children: z.array(treeNodeSchema) }))
  .meta({ id: 'TreeNode' });

const recursiveContract = c.router({
  getTree: {
    method: 'GET',
    path: '/tree',
    responses: { 200: z.object({ data: z.array(treeNodeSchema) }) },
  },
});

let packageDir: string;

function projection(overrides: Partial<PillarOpenApiProjection> = {}): PillarOpenApiProjection {
  return {
    contract: flatContract,
    packageDir,
    pillarId: 'widgets',
    description: 'A description that must survive verbatim.',
    hoistRecursiveDefinitions: false,
    ...overrides,
  };
}

function writeManifest(manifest: unknown): void {
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(manifest), 'utf8');
}

beforeEach(() => {
  packageDir = mkdtempSync(join(tmpdir(), 'contract-openapi-'));
  mkdirSync(join(packageDir, 'openapi'), { recursive: true });
  writeManifest({ name: '@pops/widgets', version: '4.2.0' });
});

afterEach(() => {
  rmSync(packageDir, { recursive: true, force: true });
});

describe('buildPillarOpenApiDocument', () => {
  it('reads title and version off the pillar manifest and keeps the description verbatim', () => {
    const document = buildPillarOpenApiDocument(projection());

    expect(document).toMatchObject({
      info: {
        title: '@pops/widgets',
        version: '4.2.0',
        description: 'A description that must survive verbatim.',
      },
    });
  });

  it('pins the document to OpenAPI 3.0', () => {
    const document = buildPillarOpenApiDocument(projection());

    expect(String(Reflect.get(document as object, 'openapi'))).toMatch(/^3\.0\./);
  });

  it('projects zod schemas rather than emitting the empty ones the zod-3 transformer would', () => {
    const document = buildPillarOpenApiDocument(projection());

    expect(JSON.stringify(document)).toContain('"label"');
  });

  it('strips the JSON-Schema draft marker that would break 3.0 consumers', () => {
    const document = buildPillarOpenApiDocument(projection());

    expect(JSON.stringify(document)).not.toContain('$schema');
  });

  it('emits every key sorted, at every depth', () => {
    const document = buildPillarOpenApiDocument(projection());
    const serialized = JSON.stringify(document, null, 2);

    expect(serialized).toBe(JSON.stringify(JSON.parse(serialized), null, 2));
    expect(Object.keys(document as Record<string, unknown>)).toEqual(
      Object.keys(document as Record<string, unknown>).toSorted()
    );
  });

  it('is deterministic across runs — the whole point of the drift check', () => {
    const first = JSON.stringify(buildPillarOpenApiDocument(projection()));
    const second = JSON.stringify(buildPillarOpenApiDocument(projection()));

    expect(first).toBe(second);
  });

  it('leaves recursive definitions dangling when the pillar opts out of hoisting', () => {
    const document = buildPillarOpenApiDocument(
      projection({ contract: recursiveContract, hoistRecursiveDefinitions: false })
    );

    expect(Reflect.get(document as object, 'components')).toBeUndefined();
    expect(JSON.stringify(document)).toContain('#/definitions/TreeNode');
  });

  it('hoists recursive definitions to components.schemas when the pillar opts in', () => {
    const document = buildPillarOpenApiDocument(
      projection({ contract: recursiveContract, hoistRecursiveDefinitions: true })
    );
    const serialized = JSON.stringify(document);

    expect(serialized).toContain('#/components/schemas/TreeNode');
    expect(serialized).not.toContain('#/definitions/');
    expect(serialized).not.toContain('"definitions"');
    expect(document).toMatchObject({ components: { schemas: { TreeNode: {} } } });
  });

  it('emits an empty components.schemas when hoisting is on and nothing is recursive', () => {
    const document = buildPillarOpenApiDocument(projection({ hoistRecursiveDefinitions: true }));

    expect(Reflect.get(document as object, 'components')).toEqual({ schemas: {} });
  });

  it('refuses a pillarId that disagrees with the package name', () => {
    expect(() => buildPillarOpenApiDocument(projection({ pillarId: 'widget' }))).toThrow(
      /expects package name "@pops\/widget"/
    );
  });

  it('falls back to 0.0.0 when the manifest carries no version', () => {
    writeManifest({ name: '@pops/widgets' });

    expect(buildPillarOpenApiDocument(projection())).toMatchObject({
      info: { version: '0.0.0' },
    });
  });

  it('refuses a manifest that is not a JSON object', () => {
    writeManifest('not-an-object');

    expect(() => buildPillarOpenApiDocument(projection())).toThrow(/is not a JSON object/);
  });
});
