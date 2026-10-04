import { getPillar } from '../pillar-client.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type TagCarrierPillar = 'finance' | 'purchases';
type TagEntityType = 'transaction' | 'purchase-item';
type AssignmentInput = { entityType: TagEntityType; entityId: string; tagId: string };
type TaggedShape = {
  tagged: {
    attach: (input: AssignmentInput) => unknown;
    detach: (input: AssignmentInput) => unknown;
  };
};

const ENTITY_TYPE_BY_PILLAR: Readonly<Record<TagCarrierPillar, TagEntityType>> = {
  finance: 'transaction',
  purchases: 'purchase-item',
};
const TOOL_NAMES = {
  attach: 'tags.assignments.attach',
  detach: 'tags.assignments.detach',
} as const;

function isTagCarrierPillar(value: string): value is TagCarrierPillar {
  return value === 'finance' || value === 'purchases';
}

function assignmentTool(operation: 'attach' | 'detach'): ToolDef {
  const action = operation === 'attach' ? 'Attach' : 'Detach';
  return {
    name: TOOL_NAMES[operation],
    description:
      `${action} a shared tag on a Finance transaction or Purchases line item. ` +
      'Use entityType transaction with pillar finance, or purchase-item with pillar purchases.',
    inputSchema: {
      type: 'object',
      properties: {
        pillar: {
          type: 'string',
          enum: ['finance', 'purchases'],
          description: 'Tag carrier pillar.',
        },
        entityType: {
          type: 'string',
          enum: ['transaction', 'purchase-item'],
          description: 'Use transaction for finance or purchase-item for purchases.',
        },
        entityId: { type: 'string', minLength: 1, description: 'Carrier entity id.' },
        tagId: { type: 'string', minLength: 1, description: 'Shared tag id.' },
      },
      required: ['pillar', 'entityType', 'entityId', 'tagId'],
    },
    readOnly: false,
    scope: '<pillar>.tagged',
    handler: async (args) => {
      const pillar = reqStr(args, 'pillar');
      if (!pillar) return toolError('Missing required field: pillar');
      if (!isTagCarrierPillar(pillar)) {
        return toolError('Invalid field: pillar must be finance or purchases.');
      }

      const entityType = reqStr(args, 'entityType');
      if (!entityType) return toolError('Missing required field: entityType');
      if (entityType !== ENTITY_TYPE_BY_PILLAR[pillar]) {
        return toolError(
          `Invalid field: entityType must be '${ENTITY_TYPE_BY_PILLAR[pillar]}' when pillar is '${pillar}'.`
        );
      }

      const entityId = reqStr(args, 'entityId');
      if (!entityId || entityId.trim().length === 0) {
        return toolError('Missing required field: entityId');
      }

      const tagId = reqStr(args, 'tagId');
      if (!tagId || tagId.trim().length === 0) {
        return toolError('Missing required field: tagId');
      }

      const input: AssignmentInput = { entityType, entityId, tagId };
      const scope = `${pillar}.tagged`;
      const carrier: PillarHandle<TaggedShape> = getPillar<TaggedShape>(pillar);
      return mapCallResult(await carrier.tagged[operation](input), scope);
    },
  };
}

export const tagsAssignmentTools: readonly ToolDef[] = [
  assignmentTool('attach'),
  assignmentTool('detach'),
];
