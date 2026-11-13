import { documentsOwner } from './documents-owner-client.js';
import { documentsReadContracts } from './documents-owner-contract.js';
import { mapCallResult, toolError } from './utils.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type Read = 'status' | 'search' | 'get' | 'task';

function dispatch(operation: Read, input: Record<string, unknown>): Promise<CallResult<unknown>> {
  const owner = documentsOwner().paperless;
  switch (operation) {
    case 'status':
      return owner.status();
    case 'search':
      if (typeof input['query'] !== 'string') throw new TypeError('Expected validated query');
      return owner.search({ query: input['query'] });
    case 'get':
      if (typeof input['id'] !== 'number') throw new TypeError('Expected validated document ID');
      return owner.get({ id: input['id'] });
    case 'task':
      if (typeof input['taskId'] !== 'string') throw new TypeError('Expected validated task ID');
      return owner.task({ taskId: input['taskId'] });
  }
}

function readTool(operation: Read, description: string): ToolDef {
  const operationId = `paperless.${operation}`;
  const { input, response } = documentsReadContracts[operation];
  const scope = `documents.${operationId}`;
  return {
    name: `documents.${operation}`,
    readOnly: true,
    scope,
    description,
    inputSchema: input.inputSchema,
    handler: async (args) => {
      const parsed = input.validate(args);
      if (!parsed.valid) return toolError(parsed.errorMessage);
      const result = await dispatch(operation, parsed.data);
      if (
        result.kind === 'ok' &&
        (!response(result.value).valid ||
          (operation === 'get' && originalId(result.value) !== parsed.data['id']))
      )
        return toolError(
          `Documents returned an invalid ${operationId} response; no source identity or completion can be confirmed.`
        );
      return mapCallResult(result, scope);
    },
  };
}

/** Direct owner reads with canonical advertised/runtime contracts; missing sources stay distinct from unavailable owners. */
export const documentsOwnerReadTools: readonly ToolDef[] = [
  readTool(
    'status',
    'Read current Documents/Paperless configuration, availability and upload limits. No configured or available state is inferred; use documents.createUpload to issue a streamed upload URL.'
  ),
  readTool(
    'search',
    'Search the Documents-owned archive by text. Returns owner-issued document metadata and IDs without an Inventory target. Associate a selected existing ID through the owning Trips command; search matches never prove that an uncertain upload completed.'
  ),
  readTool(
    'get',
    'Resolve one owner-issued Documents original ID. A genuine not-found means missing; unconfigured or unavailable means it could not be verified. Does not read or return file bytes.'
  ),
  readTool(
    'task',
    'Read the actual ingestion task returned by an accepted upload. Preserve taskId and poll reads only. pending is not complete; only done/duplicate with an actual positive documentId identifies the original for association. failed/unknown/unavailable must not trigger an automatic reupload.'
  ),
];

function originalId(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) return undefined;
  const data = value.data;
  return typeof data === 'object' && data !== null && 'id' in data ? data.id : undefined;
}
