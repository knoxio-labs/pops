import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} document */
function operationIdsFromOpenApi(document) {
  if (!isRecord(document) || !isRecord(document['paths'])) return [];

  /** @type {string[]} */
  const operationIds = [];
  for (const pathItem of Object.values(document['paths'])) {
    if (!isRecord(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method) || !isRecord(operation)) continue;
      const operationId = operation['operationId'];
      if (typeof operationId === 'string') operationIds.push(operationId);
    }
  }
  return operationIds;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {Record<string, string>}
 */
function requireStringMap(value, name) {
  if (!isRecord(value)) throw new Error(`Purchases MCP coverage must define a ${name} object.`);

  /** @type {Record<string, string>} */
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.trim().length === 0 || typeof item !== 'string') {
      throw new Error(`Purchases MCP coverage has an invalid ${name} entry.`);
    }
    result[key] = item;
  }
  return result;
}

/** @param {string} source */
function toolNamesFromSource(source) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const match of source.matchAll(/\bname:\s*(['"])(purchases\.[^'"]+)\1/g)) {
    const name = match[2];
    if (name !== undefined) names.add(name);
  }
  for (const match of source.matchAll(/['"](tags\.assignments\.(?:attach|detach))['"]/g)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

/**
 * Find purchases contract operations that lack an MCP tool or a recorded
 * reason for omission, along with stale coverage entries.
 *
 * @param {{ operationIds: string[], toolRoutes: Record<string, string>, omissionReasons: Record<string, string>, availableToolNames: ReadonlySet<string> }} input
 * @returns {string[]}
 */
export function findPurchasesMcpCoverageProblems({
  operationIds,
  toolRoutes,
  omissionReasons,
  availableToolNames,
}) {
  /** @type {string[]} */
  const problems = [];
  const operationSet = new Set(operationIds);
  if (operationSet.size !== operationIds.length)
    problems.push('Purchases OpenAPI operation IDs are not unique.');
  if (operationIds.length === 0)
    problems.push('Purchases OpenAPI document contains no operations.');

  for (const operationId of operationSet) {
    const hasTool = Object.hasOwn(toolRoutes, operationId);
    const hasReason = Object.hasOwn(omissionReasons, operationId);
    if (!hasTool && !hasReason) {
      problems.push(`Purchases operation '${operationId}' has no MCP tool or omission reason.`);
    } else if (hasTool && hasReason) {
      problems.push(`Purchases operation '${operationId}' is both exposed and marked omitted.`);
    }
  }

  for (const [operationId, toolName] of Object.entries(toolRoutes)) {
    if (!operationSet.has(operationId)) {
      problems.push(`MCP coverage refers to unknown Purchases operation '${operationId}'.`);
    }
    if (!availableToolNames.has(toolName)) {
      problems.push(`Purchases operation '${operationId}' maps to missing MCP tool '${toolName}'.`);
    }
  }

  for (const [operationId, reason] of Object.entries(omissionReasons)) {
    if (!operationSet.has(operationId)) {
      problems.push(`MCP omission refers to unknown Purchases operation '${operationId}'.`);
    }
    if (reason.trim().length === 0) {
      problems.push(`Purchases operation '${operationId}' has an empty MCP omission reason.`);
    }
  }

  return problems;
}

/**
 * Validate the checked-in Purchases OpenAPI snapshot against the MCP tool
 * inventory and its explicit omission reasons.
 *
 * @returns {string[]}
 */
export function checkPurchasesMcpCoverage() {
  const contractPath = resolve(repositoryRoot, 'pillars/purchases/openapi/purchases.openapi.json');
  const coveragePath = resolve(
    repositoryRoot,
    'pillars/mcp/src/tools/purchases-route-coverage.json'
  );
  const toolsPath = resolve(repositoryRoot, 'pillars/mcp/src/tools/purchases.ts');
  const analyticsToolsPath = resolve(
    repositoryRoot,
    'pillars/mcp/src/tools/purchases-analytics.ts'
  );
  const tagAssignmentToolsPath = resolve(
    repositoryRoot,
    'pillars/mcp/src/tools/tags-assignments.ts'
  );
  const inventoryProposalToolsPath = resolve(
    repositoryRoot,
    'pillars/mcp/src/tools/purchases-inventory-proposals.ts'
  );
  /** @type {unknown} */
  const document = JSON.parse(readFileSync(contractPath, 'utf8'));
  /** @type {unknown} */
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  if (!isRecord(coverage)) throw new Error('Purchases MCP coverage must be a JSON object.');

  return findPurchasesMcpCoverageProblems({
    operationIds: operationIdsFromOpenApi(document),
    toolRoutes: requireStringMap(coverage['tools'], 'tools'),
    omissionReasons: requireStringMap(coverage['omitted'], 'omitted'),
    availableToolNames: new Set([
      ...toolNamesFromSource(readFileSync(toolsPath, 'utf8')),
      ...toolNamesFromSource(readFileSync(analyticsToolsPath, 'utf8')),
      ...toolNamesFromSource(readFileSync(tagAssignmentToolsPath, 'utf8')),
      ...toolNamesFromSource(readFileSync(inventoryProposalToolsPath, 'utf8')),
    ]),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkPurchasesMcpCoverage();
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Purchases OpenAPI routes are covered by MCP tools or documented omissions.');
  }
}
