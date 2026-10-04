import { getPillar } from '../pillar-client.js';
import { nullStr, optStr } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

export const TAGS_SCOPE = 'tags.tags';
export const TAG_FACETS = ['trip', 'hobby', 'project'] as const;
export const INCLUDE_ARCHIVED_VALUES = ['true', 'false'] as const;

export type TagFacet = (typeof TAG_FACETS)[number];
export type IncludeArchived = (typeof INCLUDE_ARCHIVED_VALUES)[number];

export type TagWindow = {
  start: string | null;
  end: string | null;
  region: string | null;
};

export type ListTagsInput = {
  facet?: TagFacet;
  includeArchived?: IncludeArchived;
  updatedSince?: string;
};

export type CreateTagInput = {
  facet: TagFacet;
  name: string;
  parentId?: string | null;
  description?: string | null;
  window?: TagWindow | null;
};

export type UpdateTagInput = {
  id: string;
  name?: string;
  parentId?: string | null;
  description?: string | null;
  window?: TagWindow | null;
};

type TagsShape = {
  tags: {
    list: (input: ListTagsInput) => unknown;
    get: (input: { id: string }) => unknown;
    create: (input: CreateTagInput) => unknown;
    update: (input: UpdateTagInput) => unknown;
    archive: (input: { id: string }) => unknown;
    merge: (input: { id: string; intoId: string }) => unknown;
  };
};

export function tags(): PillarHandle<TagsShape> {
  return getPillar<TagsShape>('tags');
}

export function isTagFacet(value: string): value is TagFacet {
  return (TAG_FACETS as readonly string[]).includes(value);
}

export function isIncludeArchived(value: string): value is IncludeArchived {
  return (INCLUDE_ARCHIVED_VALUES as readonly string[]).includes(value);
}

export type OptionalValue<T> =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'present'; value: T };

export function optionalString(args: Record<string, unknown>, key: string): OptionalValue<string> {
  if (!(key in args)) return { kind: 'absent' };
  const value = optStr(args, key);
  return value === undefined ? { kind: 'invalid' } : { kind: 'present', value };
}

export function nullableString(
  args: Record<string, unknown>,
  key: string
): OptionalValue<string | null> {
  if (!(key in args)) return { kind: 'absent' };
  const value = nullStr(args, key);
  return value === undefined ? { kind: 'invalid' } : { kind: 'present', value };
}

export function nullableWindow(
  args: Record<string, unknown>,
  key: string
): OptionalValue<TagWindow | null> {
  if (!(key in args)) return { kind: 'absent' };
  const value = args[key];
  if (value === null) return { kind: 'present', value: null };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'invalid' };
  }

  const window = value as Record<string, unknown>;
  const { start, end, region } = window;
  if (!isNullableString(start) || !isNullableString(end) || !isNullableString(region)) {
    return { kind: 'invalid' };
  }

  return { kind: 'present', value: { start, end, region } };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export const tagWindowSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: {
          type: ['string', 'null'],
          description: 'Inclusive start date (YYYY-MM-DD), or null.',
        },
        end: {
          type: ['string', 'null'],
          description: 'Inclusive end date (YYYY-MM-DD), or null.',
        },
        region: { type: ['string', 'null'], description: 'Optional region, or null.' },
      },
      required: ['start', 'end', 'region'],
    },
    { type: 'null' },
  ],
  description: 'Optional date and region window; null clears it.',
} as const;
