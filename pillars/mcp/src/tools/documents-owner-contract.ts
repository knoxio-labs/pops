import { readFileSync } from 'node:fs';

import { contractInputs } from '../contract-inputs.js';
import { projectOperationInput, projectOperationResponse } from './openapi-input.js';

import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';

import type { OpenApiToolInput } from './openapi-input.js';

const document: unknown = JSON.parse(readFileSync(contractInputs.documents, 'utf8'));
function readContract(operation: string): {
  input: OpenApiToolInput;
  response: JsonSchemaValidator<unknown>;
} {
  const operationId = `paperless.${operation}`;
  const input = projectOperationInput(document, operationId);
  if (input.method !== 'GET')
    throw new Error(`Documents read operation is not GET: ${operationId}`);
  return { input, response: projectOperationResponse(document, operationId, 200) };
}

/** Finite canonical owner read schemas shared by advertised tools and upload-policy admission. */
export const documentsReadContracts = {
  status: readContract('status'),
  search: readContract('search'),
  get: readContract('get'),
  task: readContract('task'),
};
