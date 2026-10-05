import {
  INCLUDE_ARCHIVED_VALUES,
  TAG_FACETS,
  TAGS_SCOPE,
  isIncludeArchived,
  isTagFacet,
  optionalString,
  tags,
  type ListTagsInput,
} from './tags-shape.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const list: ToolDef = {
  name: 'tags.tags.list',
  description:
    'List shared vocabulary tags, optionally filtered by facet, archive state, or update time.',
  inputSchema: {
    type: 'object',
    properties: {
      facet: { type: 'string', enum: [...TAG_FACETS], description: 'Filter by shared tag facet.' },
      includeArchived: {
        type: 'string',
        enum: [...INCLUDE_ARCHIVED_VALUES],
        description: 'Include archived entries when true.',
      },
      updatedSince: {
        type: 'string',
        format: 'date-time',
        description: 'Return entries updated since this UTC timestamp.',
      },
    },
  },
  readOnly: true,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const input: ListTagsInput = {};
    const facet = optionalString(args, 'facet');
    if (facet.kind === 'invalid') return toolError('Invalid field: facet must be a string.');
    if (facet.kind === 'present') {
      if (!isTagFacet(facet.value)) {
        return toolError('Invalid field: facet must be trip, hobby, or project.');
      }
      input.facet = facet.value;
    }

    const includeArchived = optionalString(args, 'includeArchived');
    if (includeArchived.kind === 'invalid') {
      return toolError('Invalid field: includeArchived must be a string.');
    }
    if (includeArchived.kind === 'present') {
      if (!isIncludeArchived(includeArchived.value)) {
        return toolError('Invalid field: includeArchived must be true or false.');
      }
      input.includeArchived = includeArchived.value;
    }

    const updatedSince = optionalString(args, 'updatedSince');
    if (updatedSince.kind === 'invalid') {
      return toolError('Invalid field: updatedSince must be a string.');
    }
    if (updatedSince.kind === 'present') input.updatedSince = updatedSince.value;

    return mapCallResult(await tags().tags.list(input), TAGS_SCOPE);
  },
};

const get: ToolDef = {
  name: 'tags.tags.get',
  description: 'Get one shared vocabulary tag by its id.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid', description: 'Shared tag id.' } },
    required: ['id'],
  },
  readOnly: true,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await tags().tags.get({ id }), TAGS_SCOPE);
  },
};

export const tagsReadTools: readonly ToolDef[] = [list, get];
