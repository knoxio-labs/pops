import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { handlers } from './handlers';

/**
 * The mock layer against the contract it stands in for.
 *
 * Both directions matter and they fail differently. An operation with no
 * handler is a page that will hit a 501 the first time someone opens the
 * standalone harness — after the endpoint shipped, in whatever demo it was
 * being shown in. A handler with no operation is dead weight that reads as
 * coverage: it makes the count look right while answering something the pillar
 * no longer serves.
 *
 * Read from the committed OpenAPI document rather than from the generated
 * client, because the document is the contract. The client is one projection
 * of it, and a projection that had dropped an operation would agree with a
 * mock layer that had dropped the same one.
 */

// `import.meta.dirname` rather than a URL: this suite runs under jsdom, where
// `import.meta.url` is an http URL and `fileURLToPath` refuses it.
const SPEC_PATH = resolve(import.meta.dirname, '../../../../openapi/purchases.openapi.json');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

interface OpenApiDocument {
  readonly paths: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

function contractOperations(): string[] {
  const parsed: unknown = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const { paths } = parsed as OpenApiDocument;
  const out: string[] = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.has(method)) out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out.toSorted();
}

describe('the mock layer covers the purchases contract', () => {
  const operations = contractOperations();
  const handled = Object.keys(handlers).toSorted();

  // The floor. A spec this test could not read would make every assertion
  // below vacuously true, and the suite would go green having checked nothing.
  it('reads a contract with operations in it', () => {
    expect(operations.length).toBeGreaterThan(20);
  });

  it.each(operations)('%s has a handler', (operation) => {
    expect(handled).toContain(operation);
  });

  it('has no handler for an operation the contract does not declare', () => {
    expect(handled.filter((key) => !operations.includes(key))).toEqual([]);
  });

  it('covers the contract exactly', () => {
    expect(handled).toEqual(operations);
  });
});
