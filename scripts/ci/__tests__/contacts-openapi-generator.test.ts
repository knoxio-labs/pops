import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'oxfmt';
import { afterEach, expect, it, vi } from 'vitest';

import { generateContactsOpenApi } from '../../../pillars/contacts/scripts/generate-openapi.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures: string[] = [];
const source = `${JSON.stringify(
  {
    openapi: '3.0.3',
    paths: {},
    components: {
      schemas: {
        Example: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'integer', format: 'int64' },
            name: { type: 'string', nullable: true },
            reference: { $ref: '#/components/schemas/Example' },
            choice: { oneOf: [{ type: 'boolean' }, { type: 'string' }] },
          },
          additionalProperties: false,
        },
      },
    },
  },
  null,
  2
)}\n`;

async function fixture() {
  const root = await mkdtemp(join(repositoryRoot, 'tmp/contacts-openapi-'));
  fixtures.push(root);
  const output = join(root, 'pillars/contacts/openapi/contacts.openapi.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, 'previous artifact\n');
  await writeFile(
    join(root, '.oxfmtrc.json'),
    await readFile(join(repositoryRoot, '.oxfmtrc.json'))
  );
  return { root, output };
}

afterEach(async () => {
  for (const root of fixtures.splice(0)) await rm(root, { recursive: true, force: true });
});

it('uses actual repository format options without changing the emitted JSON value', async () => {
  const { root, output } = await fixture();
  const emit = vi.fn(() => source);
  let observedPath: string | undefined;
  let observedOptions: Parameters<typeof format>[2];
  await generateContactsOpenApi({
    repoRoot: root,
    emit,
    formatDocument: async (path, input, options) => {
      observedPath = path;
      observedOptions = options;
      return format(path, input, options);
    },
  });
  const actual = await readFile(output, 'utf8');
  expect(emit).toHaveBeenCalledExactlyOnceWith(root);
  expect(observedPath).toBe(output);
  const config = JSON.parse(await readFile(join(root, '.oxfmtrc.json'), 'utf8'));
  expect(observedOptions).toEqual(
    Object.fromEntries(
      Object.entries(config).filter(([key]) => key !== '$schema' && key !== 'ignorePatterns')
    )
  );
  expect(actual).not.toBe(source);
  expect(actual).toContain('"required": ["id", "name"]');
  expect(JSON.parse(actual)).toEqual(JSON.parse(source));
  const reformat = await format(output, actual, observedOptions);
  expect(reformat.errors).toEqual([]);
  expect(reformat.code).toBe(actual);
  await generateContactsOpenApi({ repoRoot: root, emit });
  expect(await readFile(output, 'utf8')).toBe(actual);
  expect(await readdir(dirname(output))).toEqual(['contacts.openapi.json']);
});

it('reads configured formatting instead of hardcoding the current repository defaults', async () => {
  const { root, output } = await fixture();
  await writeFile(join(root, '.oxfmtrc.json'), JSON.stringify({ tabWidth: 4, printWidth: 40 }));
  await generateContactsOpenApi({ repoRoot: root, emit: () => source });
  const actual = await readFile(output, 'utf8');
  expect(actual).toContain('\n    "openapi":');
  expect(actual).toBe((await format(output, source, { tabWidth: 4, printWidth: 40 })).code);
  expect(JSON.parse(actual)).toEqual(JSON.parse(source));
});

it('leaves the artifact untouched on a producer failure', async () => {
  const { root, output } = await fixture();
  await expect(
    generateContactsOpenApi({
      repoRoot: root,
      emit: () => {
        throw new Error('producer failed');
      },
    })
  ).rejects.toThrow('producer failed');
  expect(await readFile(output, 'utf8')).toBe('previous artifact\n');
});

it('leaves the artifact untouched on malformed producer JSON', async () => {
  const { root, output } = await fixture();
  const formatDocument = vi.fn(format);
  await expect(
    generateContactsOpenApi({ repoRoot: root, emit: () => '{', formatDocument })
  ).rejects.toThrow();
  expect(formatDocument).not.toHaveBeenCalled();
  expect(await readFile(output, 'utf8')).toBe('previous artifact\n');
});

it('leaves the artifact untouched when the real formatter reports errors', async () => {
  const { root, output } = await fixture();
  await expect(
    generateContactsOpenApi({
      repoRoot: root,
      emit: () => source,
      formatDocument: (path, _input, options) => format(path, '{', options),
    })
  ).rejects.toThrow('Contacts OpenAPI formatting failed.');
  expect(await readFile(output, 'utf8')).toBe('previous artifact\n');
});

it.each(['{"changed":true}\n', '{'])(
  'refuses changed or malformed formatter output: %s',
  async (code) => {
    const { root, output } = await fixture();
    await expect(
      generateContactsOpenApi({
        repoRoot: root,
        emit: () => source,
        formatDocument: async () => ({ code, errors: [] }),
      })
    ).rejects.toThrow();
    expect(await readFile(output, 'utf8')).toBe('previous artifact\n');
    expect(await readdir(dirname(output))).toEqual(['contacts.openapi.json']);
  }
);

it('rejects unhandled formatter overrides instead of silently formatting with different options', async () => {
  const { root, output } = await fixture();
  await writeFile(
    join(root, '.oxfmtrc.json'),
    JSON.stringify({ overrides: [{ files: ['*.json'], options: { tabWidth: 4 } }] })
  );
  await expect(generateContactsOpenApi({ repoRoot: root, emit: () => source })).rejects.toThrow(
    'resolve formatter overrides'
  );
  expect(await readFile(output, 'utf8')).toBe('previous artifact\n');
});

it('removes the uncommitted temporary artifact after a failed replacement', async () => {
  const { root, output } = await fixture();
  await rm(output);
  await mkdir(output);
  await writeFile(join(output, 'retained'), 'retained');
  await expect(generateContactsOpenApi({ repoRoot: root, emit: () => source })).rejects.toThrow();
  expect(await readFile(join(output, 'retained'), 'utf8')).toBe('retained');
  expect(await readdir(dirname(output))).toEqual(['contacts.openapi.json']);
});
