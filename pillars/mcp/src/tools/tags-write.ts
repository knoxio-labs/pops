import {
  TAGS_SCOPE,
  TAG_FACETS,
  isTagFacet,
  nullableString,
  nullableWindow,
  tagWindowSchema,
  tags,
  type CreateTagInput,
  type UpdateTagInput,
} from './tags-shape.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const create: ToolDef = {
  name: 'tags.tags.create',
  description: 'Create a shared vocabulary tag, or return the matching existing active tag.',
  inputSchema: {
    type: 'object',
    properties: {
      facet: { type: 'string', enum: [...TAG_FACETS], description: 'Shared tag facet.' },
      name: { type: 'string', minLength: 1, description: 'Tag name.' },
      parentId: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'Parent tag id, or null.',
      },
      description: { type: ['string', 'null'], description: 'Description, or null.' },
      window: tagWindowSchema,
    },
    required: ['facet', 'name'],
  },
  readOnly: false,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const facet = reqStr(args, 'facet');
    if (!facet) return toolError('Missing required field: facet');
    if (!isTagFacet(facet)) {
      return toolError('Invalid field: facet must be trip, hobby, or project.');
    }

    const name = reqStr(args, 'name');
    if (!name || name.trim().length === 0) return toolError('Missing required field: name');

    const input: CreateTagInput = { facet, name };
    const parentId = nullableString(args, 'parentId');
    if (parentId.kind === 'invalid') {
      return toolError('Invalid field: parentId must be a string or null.');
    }
    if (parentId.kind === 'present') input.parentId = parentId.value;

    const description = nullableString(args, 'description');
    if (description.kind === 'invalid') {
      return toolError('Invalid field: description must be a string or null.');
    }
    if (description.kind === 'present') input.description = description.value;

    const window = nullableWindow(args, 'window');
    if (window.kind === 'invalid') {
      return toolError('Invalid field: window must be an object or null.');
    }
    if (window.kind === 'present') input.window = window.value;

    return mapCallResult(await tags().tags.create(input), TAGS_SCOPE);
  },
};

const update: ToolDef = {
  name: 'tags.tags.update',
  description: 'Update a shared tag name, parent, description, or date window.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Shared tag id.' },
      name: { type: 'string', minLength: 1, description: 'New tag name.' },
      parentId: {
        type: ['string', 'null'],
        format: 'uuid',
        description: 'New parent tag id, or null.',
      },
      description: { type: ['string', 'null'], description: 'New description, or null.' },
      window: tagWindowSchema,
    },
    required: ['id'],
  },
  readOnly: false,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');

    const input: UpdateTagInput = { id };
    if ('name' in args) {
      const name = reqStr(args, 'name');
      if (!name || name.trim().length === 0) {
        return toolError('Invalid field: name must be non-empty.');
      }
      input.name = name;
    }

    const parentId = nullableString(args, 'parentId');
    if (parentId.kind === 'invalid') {
      return toolError('Invalid field: parentId must be a string or null.');
    }
    if (parentId.kind === 'present') input.parentId = parentId.value;

    const description = nullableString(args, 'description');
    if (description.kind === 'invalid') {
      return toolError('Invalid field: description must be a string or null.');
    }
    if (description.kind === 'present') input.description = description.value;

    const window = nullableWindow(args, 'window');
    if (window.kind === 'invalid') {
      return toolError('Invalid field: window must be an object or null.');
    }
    if (window.kind === 'present') input.window = window.value;

    return mapCallResult(await tags().tags.update(input), TAGS_SCOPE);
  },
};

const archive: ToolDef = {
  name: 'tags.tags.archive',
  description: 'Archive a shared vocabulary tag without deleting it.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid', description: 'Shared tag id.' } },
    required: ['id'],
  },
  readOnly: false,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await tags().tags.archive({ id }), TAGS_SCOPE);
  },
};

const merge: ToolDef = {
  name: 'tags.tags.merge',
  description: 'Merge this shared tag into another tag.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Tag id to merge from.' },
      intoId: { type: 'string', format: 'uuid', description: 'Tag id that remains.' },
    },
    required: ['id', 'intoId'],
  },
  readOnly: false,
  scope: TAGS_SCOPE,
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const intoId = reqStr(args, 'intoId');
    if (!intoId) return toolError('Missing required field: intoId');
    return mapCallResult(await tags().tags.merge({ id, intoId }), TAGS_SCOPE);
  },
};

export const tagsWriteTools: readonly ToolDef[] = [create, update, archive, merge];
