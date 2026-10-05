import { getPillar } from '../pillar-client.js';
import { mapCallResult, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

interface TaggedQueryInput {
  tagIds: string[];
  limit?: number;
}

type OrchestratorShape = {
  tagged: {
    query: (input: TaggedQueryInput) => unknown;
  };
};

function orchestrator(): PillarHandle<OrchestratorShape> {
  return getPillar<OrchestratorShape>('orchestrator');
}

function isTagIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 500 &&
    value.every((id) => typeof id === 'string' && id.trim().length > 0)
  );
}

const thingsList: ToolDef = {
  name: 'tags.things.list',
  description:
    'List things carrying any shared tag id across registered tag-carrier pillars. Before treating results as complete, inspect the response `pillars` status list; an `unavailable` or `unauthorized` status means results from that pillar may be missing.',
  inputSchema: {
    type: 'object',
    properties: {
      tagIds: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        items: { type: 'string', minLength: 1 },
        description: 'One or more shared tag ids; results match any listed id.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Maximum number of things returned per carrier (default 200).',
      },
    },
    required: ['tagIds'],
  },
  readOnly: true,
  handler: async (args) => {
    const tagIds = args['tagIds'];
    if (!isTagIdList(tagIds)) {
      return toolError('Invalid field: tagIds must contain 1-500 non-empty shared tag ids.');
    }

    const limit = args['limit'];
    if (
      limit !== undefined &&
      (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 500)
    ) {
      return toolError('Invalid field: limit must be an integer from 1 to 500.');
    }

    const input: TaggedQueryInput = { tagIds };
    if (typeof limit === 'number') input.limit = limit;

    return mapCallResult(await orchestrator().tagged.query(input));
  },
};

export const tagsThingsTools: readonly ToolDef[] = [thingsList];
