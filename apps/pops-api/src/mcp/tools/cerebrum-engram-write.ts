/**
 * cerebrum.engram.write — update an existing engram.
 *
 * Delegates to EngramService.update() and returns updated metadata.
 */
import { getEngramService } from '../../modules/cerebrum/instance.js';
import { mapServiceError, mcpError, mcpSuccess } from '../errors.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { UpdateEngramInput } from '../../modules/cerebrum/engrams/service.js';

interface WriteArgs {
  id: string;
  body?: string;
  title?: string;
  scopes?: string[];
  tags?: string[];
}

function parseArgs(raw: Record<string, unknown>): WriteArgs {
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  const body = typeof raw['body'] === 'string' ? raw['body'] : undefined;
  const title = typeof raw['title'] === 'string' ? raw['title'] : undefined;
  const scopes = Array.isArray(raw['scopes'])
    ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  const tags = Array.isArray(raw['tags'])
    ? (raw['tags'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  return { id, body, title, scopes, tags };
}

export async function handleEngramWrite(raw: Record<string, unknown>): Promise<CallToolResult> {
  const args = parseArgs(raw);

  if (!args.id.trim()) {
    return mcpError('id is required', 'VALIDATION_ERROR');
  }

  const hasChanges =
    args.body !== undefined ||
    args.title !== undefined ||
    args.scopes !== undefined ||
    args.tags !== undefined;

  if (!hasChanges) {
    return mcpError('at least one field to update must be provided', 'VALIDATION_ERROR');
  }

  try {
    const svc = getEngramService();
    const changes: UpdateEngramInput = {};
    if (args.body !== undefined) changes.body = args.body;
    if (args.title !== undefined) changes.title = args.title;
    if (args.scopes !== undefined) changes.scopes = args.scopes;
    if (args.tags !== undefined) changes.tags = args.tags;

    const engram = svc.update(args.id, changes);

    return mcpSuccess({
      engram: {
        id: engram.id,
        title: engram.title,
        type: engram.type,
        scopes: engram.scopes,
        modified: engram.modified,
      },
    });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.engram.write tool input. */
export const engramWriteSchema = {
  type: 'object' as const,
  properties: {
    id: {
      type: 'string' as const,
      description: 'Engram ID to update',
    },
    body: {
      type: 'string' as const,
      description: 'New body content',
    },
    title: {
      type: 'string' as const,
      description: 'New title',
    },
    scopes: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Replacement scopes',
    },
    tags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Replacement tags',
    },
  },
  required: ['id'] as const,
};
