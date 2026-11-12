import { readFileSync } from 'node:fs';

import { contractInputs } from '../contract-inputs.js';
import { getPillar } from '../pillar-client.js';
import { projectOperationInput, projectOperationSuccess } from './openapi-input.js';
import { arrangementOperations } from './trips/arrangements.js';
import { planningOperations } from './trips/planning.js';
import { sourceOperations } from './trips/sources.js';
import { mapCallResult, toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './tool-def.js';

const document: unknown = JSON.parse(readFileSync(contractInputs.trips, 'utf8'));
const operations = { ...planningOperations, ...sourceOperations, ...arrangementOperations };
const receiptOperations = new Set([
  'route.operate',
  'meetingPlans.operate',
  'journeyLegs.remove',
  'captures.create',
  'captures.update',
  'captures.attach',
  'captures.remove',
  'captures.organise',
  'captures.removeAssociation',
  'captures.undo',
  'ideas.create',
  'ideas.update',
  'ideas.remove',
  'ideas.undo',
  'explore.add',
  'explore.remove',
  'explore.undo',
]);

function retryGuidance(operationId: string): string {
  if (operationId === 'trips.createOperation')
    return 'Retain the original operationId UUID and unchanged full command input across unknown responses or unavailable capability. Explicit replay returns the original receipt and current Trip. Never fall back to legacy trips.trips.create, generate a replacement UUID, or automatically retry.';
  return receiptOperations.has(operationId)
    ? 'Retain the original operationId and unchanged full arguments. Reuse that exact UUID/payload to recover the producer receipt; never replace it after an unknown response. Preserve required revision guards and returned receipt/current/replayed/undone metadata.'
    : 'Do not automatically repeat this mutation after an unknown response. Reconcile the owning canonical state before issuing a new command; this operation does not publish a durable operationId replay boundary.';
}

function withUnknownOutcome(result: CallToolResult, operationId: string): CallToolResult {
  return {
    ...result,
    content: [
      { type: 'text', text: `The mutation outcome may be unknown. ${retryGuidance(operationId)}` },
      ...result.content,
    ],
  };
}

function defineTool(operationId: string, description: string): ToolDef {
  const input = projectOperationInput(document, operationId);
  const success = projectOperationSuccess(document, operationId);
  const parts = operationId.split('.');
  const router = parts[0];
  const procedure = parts[1];
  if (parts.length !== 2 || router === undefined || procedure === undefined)
    throw new Error(`Invalid finite Trips operation: ${operationId}`);
  const scope = `trips.${operationId}`;
  const readOnly = input.method === 'GET';
  return {
    name: scope,
    scope,
    readOnly,
    description: readOnly ? description : `${description} ${retryGuidance(operationId)}`,
    inputSchema: input.inputSchema,
    handler: async (args) => {
      const parsed = input.validate(args);
      if (!parsed.valid) return toolError(`Invalid ${scope} arguments: ${parsed.errorMessage}`);
      const result = await getPillar('trips').callDynamic(
        router,
        procedure,
        parsed.data,
        readOnly ? 'query' : 'mutation'
      );
      if (result.kind !== 'ok') {
        const mapped = mapCallResult(result, scope);
        if (
          operationId === 'trips.createOperation' &&
          (result.kind === 'not-found' || result.kind === 'contract-mismatch')
        ) {
          return {
            ...mapped,
            content: [
              {
                type: 'text',
                text: `Durable Trip creation capability is unavailable. ${retryGuidance(operationId)}`,
              },
              ...mapped.content,
            ],
          };
        }
        return !readOnly && result.kind === 'unavailable'
          ? withUnknownOutcome(mapped, operationId)
          : mapped;
      }
      const validated = success.validate(result.value);
      if (!validated.valid) {
        const mapped = toolError(
          `Trips returned a response outside the published ${scope} contract: ${validated.errorMessage}`
        );
        return readOnly ? mapped : withUnknownOutcome(mapped, operationId);
      }
      return mapCallResult(result, scope);
    },
  };
}

/** Finite canonical Trips tools; each validates the advertised schema and calls only its own published operation. */
export const tripsTools: readonly ToolDef[] = Object.entries(operations).map(
  ([operationId, description]) => defineTool(operationId, description)
);
