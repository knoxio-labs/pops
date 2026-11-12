import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

import { projectOpenApiSchema } from './openapi-schema.js';
import {
  openApiArray as entries,
  openApiObject as record,
  openApiStrings as strings,
} from './openapi-values.js';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';

const validator = new AjvJsonSchemaValidator();

/** One published operation's flat MCP argument contract, validated without coercion or default insertion. */
export interface OpenApiToolInput {
  readonly method: string;
  readonly inputSchema: Tool['inputSchema'];
  readonly validate: (
    input: unknown
  ) => { valid: true; data: Record<string, unknown> } | { valid: false; errorMessage: string };
}

/** A single declared successful HTTP outcome; no-content validation accepts only undefined. */
export interface OpenApiToolSuccess {
  readonly status: number;
  readonly validate: JsonSchemaValidator<unknown>;
}

interface PublishedOperation {
  method: string;
  operation: Record<string, unknown>;
  parameters: unknown[];
}

function operationFor(document: unknown, operationId: string): PublishedOperation {
  const root = record(document, 'OpenAPI document');
  if (root['openapi'] !== '3.0.2' && root['openapi'] !== '3.0.3') {
    throw new Error('Expected a published OpenAPI 3.0.2 or 3.0.3 contract');
  }
  const matches: PublishedOperation[] = [];
  for (const value of Object.values(record(root['paths'], 'OpenAPI paths'))) {
    const path = record(value, 'OpenAPI path');
    for (const [method, child] of Object.entries(path)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const operation = record(child, 'OpenAPI operation');
      if (operation['operationId'] === operationId) {
        matches.push({
          method: method.toUpperCase(),
          operation,
          parameters: [
            ...entries(path['parameters'] ?? [], 'path parameters'),
            ...entries(operation['parameters'] ?? [], 'operation parameters'),
          ],
        });
      }
    }
  }
  const match = matches[0];
  if (matches.length !== 1 || match === undefined)
    throw new Error(`Expected exactly one OpenAPI operation: ${operationId}`);
  return match;
}

function requestBodyFor(document: unknown, operationId: string): Record<string, unknown> {
  const operation = operationFor(document, operationId).operation;
  if (operation['requestBody'] === undefined) return {};
  const body = record(operation['requestBody'], 'requestBody');
  const content = record(body['content'], 'request content');
  const json = record(content['application/json'], 'JSON request content');
  const bodySchema = projectOpenApiSchema(document, json['schema']);
  if (bodySchema['type'] !== 'object')
    throw new Error(`Expected an object request body: ${operationId}`);
  const rootKeys = new Set([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'description',
    'title',
  ]);
  const additional = bodySchema['additionalProperties'];
  if (
    Object.keys(bodySchema).some((key) => !rootKeys.has(key)) ||
    (additional !== false && additional !== undefined)
  ) {
    throw new Error(`Cannot flatten request body constraints safely: ${operationId}`);
  }
  return bodySchema;
}

/**
 * Project one explicit published OpenAPI 3.0 operation to MCP arguments.
 * Path/query parameters and body properties are flat, matching the server SDK.
 * Unsupported schema constraints, ambiguous fields and unresolved refs fail at startup.
 * OpenAPI int32/int64/double formats become equivalent numeric bounds; nullable
 * numeric formats retain null outside those bounds. No values are coerced or defaulted.
 * This function supplies no routing: callers retain a finite operation allowlist.
 */
export function projectOperationInput(document: unknown, operationId: string): OpenApiToolInput {
  const match = operationFor(document, operationId);
  const properties = new Map<string, Record<string, unknown>>();
  const required: string[] = [];
  function add(name: string, value: Record<string, unknown>, isRequired: boolean): void {
    if (properties.has(name)) throw new Error(`Ambiguous OpenAPI input: ${operationId}.${name}`);
    properties.set(name, value);
    if (isRequired) required.push(name);
  }
  for (const value of match.parameters) {
    const parameter = record(value, 'OpenAPI parameter');
    const location = parameter['in'];
    const name = parameter['name'];
    if ((location !== 'path' && location !== 'query') || typeof name !== 'string') {
      throw new Error(`Unsupported OpenAPI parameter in ${operationId}`);
    }
    add(
      name,
      projectOpenApiSchema(document, parameter['schema']),
      location === 'path' || parameter['required'] === true
    );
  }
  const bodySchema = requestBodyFor(document, operationId);
  const bodyRequired = strings(bodySchema['required'], 'required body properties');
  for (const [name, value] of Object.entries(
    record(bodySchema['properties'] ?? {}, 'body properties')
  )) {
    add(name, record(value, 'body property schema'), bodyRequired.includes(name));
  }
  const inputSchema: Tool['inputSchema'] = {
    type: 'object',
    properties: Object.fromEntries(properties),
    required,
    additionalProperties: false,
  };
  const validate = validator.getValidator<Record<string, unknown>>(inputSchema);
  return { method: match.method, inputSchema, validate };
}

/** Validate a declared JSON response without mapping, dropping fields or rewriting owner-issued identities. */
export function projectOperationResponse(
  document: unknown,
  operationId: string,
  status: number
): JsonSchemaValidator<unknown> {
  const operation = operationFor(document, operationId).operation;
  const response = record(
    record(operation['responses'], 'responses')[String(status)],
    `response ${status}`
  );
  const json = record(
    record(response['content'], 'response content')['application/json'],
    'JSON response'
  );
  return validator.getValidator(projectOpenApiSchema(document, json['schema']));
}

/** Read one unambiguous declared success contract; unsupported or absent success shapes fail startup. */
export function projectOperationSuccess(
  document: unknown,
  operationId: string
): OpenApiToolSuccess {
  const operation = operationFor(document, operationId).operation;
  const statuses = Object.keys(record(operation['responses'], 'responses')).filter((status) =>
    /^2\d\d$/u.test(status)
  );
  const status = statuses[0];
  if (statuses.length !== 1 || status === undefined)
    throw new Error(`Expected exactly one success status: ${operationId}`);
  if (status !== '204')
    return {
      status: Number(status),
      validate: projectOperationResponse(document, operationId, Number(status)),
    };
  const response = record(record(operation['responses'], 'responses')[status], 'response 204');
  if (response['content'] !== undefined)
    throw new Error(`Unexpected HTTP 204 response content: ${operationId}`);
  return {
    status: 204,
    validate: (value) =>
      value === undefined
        ? { valid: true, data: undefined, errorMessage: undefined }
        : {
            valid: false,
            data: undefined,
            errorMessage: 'Expected HTTP 204 without a response body',
          },
  };
}
