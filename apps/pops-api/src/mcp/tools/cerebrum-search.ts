/**
 * cerebrum.search — hybrid search over the engram knowledge base.
 *
 * Delegates to HybridSearchService and maps results to the MCP output format.
 */
import { getDrizzle } from '../../db.js';
import { HybridSearchService } from '../../modules/cerebrum/retrieval/hybrid-search.js';
import { mapServiceError, mcpError, mcpSuccess } from '../errors.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { RetrievalResult } from '../../modules/cerebrum/retrieval/types.js';

const MAX_SNIPPET_LENGTH = 200;
const DEFAULT_LIMIT = 20;

interface SearchArgs {
  query: string;
  scopes?: string[];
  limit?: number;
}

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

function hasExplicitSecretScope(scopes: string[] | undefined): boolean {
  return scopes?.some(isSecretScope) ?? false;
}

function truncateSnippet(text: string): string {
  if (text.length <= MAX_SNIPPET_LENGTH) return text;
  return text.slice(0, MAX_SNIPPET_LENGTH) + '…';
}

function mapResult(result: RetrievalResult): {
  id: string;
  title: string;
  score: number;
  scopes: string[];
  snippet: string;
} {
  const scopes = (result.metadata['scopes'] as string[] | undefined) ?? [];
  return {
    id: result.sourceId,
    title: result.title,
    score: result.score,
    scopes,
    snippet: truncateSnippet(result.contentPreview),
  };
}

function parseArgs(raw: Record<string, unknown>): SearchArgs {
  const query = typeof raw['query'] === 'string' ? raw['query'] : '';
  const scopes = Array.isArray(raw['scopes'])
    ? (raw['scopes'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : undefined;
  const limit =
    typeof raw['limit'] === 'number' && Number.isInteger(raw['limit']) && raw['limit'] > 0
      ? raw['limit']
      : undefined;
  return { query, scopes, limit };
}

export async function handleCerebrumSearch(raw: Record<string, unknown>): Promise<CallToolResult> {
  const args = parseArgs(raw);

  if (!args.query.trim()) {
    return mcpError('query is required and must be non-empty', 'VALIDATION_ERROR');
  }

  try {
    const db = getDrizzle();
    const svc = new HybridSearchService(db);

    const includeSecret = hasExplicitSecretScope(args.scopes);
    const filters = {
      ...(args.scopes ? { scopes: args.scopes } : {}),
      includeSecret,
    };

    const results = await svc.hybrid(args.query, filters, args.limit ?? DEFAULT_LIMIT, 0.8);

    return mcpSuccess({ results: results.map(mapResult) });
  } catch (err) {
    return mapServiceError(err);
  }
}

/** JSON Schema for the cerebrum.search tool input. */
export const cerebrumSearchSchema = {
  type: 'object' as const,
  properties: {
    query: { type: 'string' as const, description: 'Natural language search query' },
    scopes: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: 'Optional scope filters (e.g. ["personal.finance", "work.projects"])',
    },
    limit: {
      type: 'number' as const,
      description: 'Maximum number of results (default 20, max 100)',
    },
  },
  required: ['query'] as const,
};
