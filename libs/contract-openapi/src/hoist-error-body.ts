import { isRecord } from './json.js';

const ERROR_BODY_REF = '#/definitions/ErrorBody';
const ERROR_BODY_COMPONENT_REF = '#/components/schemas/ErrorBody';

/**
 * Move the shared error envelope into OpenAPI components without moving any
 * other definitions. Pillars that do not need recursive-definition hoisting
 * still publish one stable ErrorBody component.
 */
export function hoistErrorBodyDefinition(document: Record<string, unknown>): void {
  let errorBody: unknown;
  collectErrorBody(document['paths'], (schema) => {
    errorBody ??= schema;
  });
  if (errorBody === undefined) return;
  const components = ensureRecord(document, 'components');
  const schemas = ensureRecord(components, 'schemas');
  schemas['ErrorBody'] = errorBody;
  replaceErrorBodyRefs(document);
}

function collectErrorBody(node: unknown, onFound: (schema: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) collectErrorBody(item, onFound);
    return;
  }
  if (!isRecord(node)) return;

  const definitions = node['definitions'];
  if (isRecord(definitions) && definitions['ErrorBody'] !== undefined) {
    onFound(definitions['ErrorBody']);
    delete definitions['ErrorBody'];
    if (Object.keys(definitions).length === 0) delete node['definitions'];
  }
  const jsonDefinitions = node['$defs'];
  if (isRecord(jsonDefinitions) && jsonDefinitions['ErrorBody'] !== undefined) {
    onFound(jsonDefinitions['ErrorBody']);
    delete jsonDefinitions['ErrorBody'];
    if (Object.keys(jsonDefinitions).length === 0) delete node['$defs'];
  }
  for (const value of Object.values(node)) collectErrorBody(value, onFound);
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = parent[key];
  if (isRecord(current)) return current;
  const created: Record<string, unknown> = {};
  parent[key] = created;
  return created;
}

function replaceErrorBodyRefs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) replaceErrorBodyRefs(item);
    return;
  }
  if (!isRecord(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (value === ERROR_BODY_REF) {
      node[key] = ERROR_BODY_COMPONENT_REF;
      continue;
    }
    replaceErrorBodyRefs(value);
  }
}
