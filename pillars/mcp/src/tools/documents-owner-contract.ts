import { readFileSync } from 'node:fs';

import { contractInputs } from '../contract-inputs.js';
import { projectOperationInput, projectOperationResponse } from './openapi-input.js';

import type { JsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';

import type { OpenApiToolInput } from './openapi-input.js';

const document: unknown = JSON.parse(readFileSync(contractInputs.documents, 'utf8'));
function contract(operationId: string): {
  input: OpenApiToolInput;
  response: JsonSchemaValidator<unknown>;
} {
  const input = projectOperationInput(document, operationId);
  return { input, response: projectOperationResponse(document, operationId, 200) };
}

/** Finite canonical owner read schemas shared by advertised tools and upload-policy admission. */
export const documentsReadContracts = {
  status: contract('paperless.status'),
  search: contract('paperless.search'),
  get: contract('paperless.get'),
  task: contract('paperless.task'),
  upload: contract('paperless.upload'),
  createUpload: contract('write.createUpload'),
  dispatchUpload: contract('write.dispatchUpload'),
};
