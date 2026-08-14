import { isRecord } from './json.js';

const DEF_KEYS = ['definitions', '$defs'];

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = parent[key];
  if (isRecord(existing)) return existing;
  const created: Record<string, unknown> = {};
  parent[key] = created;
  return created;
}

/**
 * zod 4 emits recursive schemas as a nested `definitions` block with
 * root-relative `#/definitions/<id>` refs. Those dangle for OpenAPI consumers
 * (the defs live under a response schema, not the document root). Hoist every
 * nested `definitions` / `$defs` entry into the document-level
 * `components.schemas` and rewrite the refs accordingly. Stable
 * `.meta({ id })` names keep this deterministic for the drift check.
 *
 * `components.schemas` is materialised unconditionally — including as an empty
 * object when a contract carries no recursive schema at all. That is why the
 * projection exposes this as a per-pillar switch rather than always running it:
 * the committed snapshots of the pillars that never called it carry no
 * `components` key, and creating one would be a wire-visible change.
 */
export function hoistRecursiveDefinitions(document: Record<string, unknown>): void {
  const schemas = ensureRecord(ensureRecord(document, 'components'), 'schemas');

  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (!isRecord(node)) return;
    for (const key of DEF_KEYS) {
      const defs = node[key];
      if (isRecord(defs)) {
        for (const [name, schema] of Object.entries(defs)) {
          schemas[name] = schema;
        }
        delete node[key];
      }
    }
    for (const value of Object.values(node)) collect(value);
  };

  const rewrite = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(rewrite);
      return;
    }
    if (!isRecord(node)) return;
    const ref = node['$ref'];
    if (typeof ref === 'string') {
      node['$ref'] = ref
        .replace('#/definitions/', '#/components/schemas/')
        .replace('#/$defs/', '#/components/schemas/');
    }
    for (const value of Object.values(node)) rewrite(value);
  };

  collect(document['paths']);
  rewrite(document);
}
