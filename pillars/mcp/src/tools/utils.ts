import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { CallResult } from '@pops/pillar-sdk/client';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Translate a `CallResult` from the pillar SDK into an MCP `CallToolResult`.
 * `ok` rounds-trips the value JSON. Every failure shape surfaces as MCP
 * `toolError` so the LLM can read the reason and self-correct or retry.
 */
export function mapCallResult<T>(result: CallResult<T>): CallToolResult {
  if (result.kind === 'ok') return ok(result.value);
  return toolError(formatFailureReason(result));
}

const MESSAGE_FALLBACK: Record<
  'not-found' | 'conflict' | 'bad-request' | 'unauthorized' | 'refused',
  string
> = {
  'not-found': 'returned not-found for this request',
  conflict: 'returned conflict for this request',
  'bad-request': 'returned bad-request for this request',
  unauthorized: 'rejected this request (unauthorized)',
  refused: 'refused this request and will refuse it again unchanged',
};

function formatFailureReason(failure: Exclude<CallResult<unknown>, { kind: 'ok' }>): string {
  switch (failure.kind) {
    case 'unavailable':
      return `Pillar '${failure.pillar}' is unavailable. Try again shortly.`;
    case 'degraded':
      return `Pillar '${failure.pillar}' is reconciling (${failure.reason}). Try again shortly.`;
    case 'contract-mismatch':
      return `Pillar '${failure.pillar}' contract mismatch — expected ${failure.expected ?? 'unknown'}, got ${failure.actual ?? 'unknown'}.`;
    case 'rate-limited':
      return formatRateLimited(failure);
    default:
      return formatSimpleFailure(failure);
  }
}

function formatRateLimited(
  failure: Extract<CallResult<unknown>, { kind: 'rate-limited' }>
): string {
  if (failure.retryAfterSeconds === undefined) {
    return `Pillar '${failure.pillar}' is rate-limiting this request. Try again shortly.`;
  }
  return `Pillar '${failure.pillar}' is rate-limiting this request. Try again in ${String(failure.retryAfterSeconds)}s.`;
}

/** The failure kinds that only ever need the message-or-fallback treatment. */
function formatSimpleFailure(
  failure: Extract<
    CallResult<unknown>,
    { kind: 'not-found' | 'conflict' | 'bad-request' | 'unauthorized' | 'refused' }
  >
): string {
  return failure.message ?? `Pillar '${failure.pillar}' ${MESSAGE_FALLBACK[failure.kind]}.`;
}

export function reqStr(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

export function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' ? v : undefined;
}

export function optBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

// Three-state: absent → undefined (no-op), null → null (clear), string → string (set)
export function nullStr(args: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  return typeof v === 'string' ? v : undefined;
}

// Three-state: absent → undefined (no-op), null → null (clear), number → number (set)
export function nullNum(args: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  return typeof v === 'number' ? v : undefined;
}

// Pick the right helper to match the column's nullability: copyNullStr /
// copyNullNum forward an explicit `null` so callers can CLEAR a nullable
// backend column; copyOptStr / copyOptBool drop nulls so callers cannot
// accidentally NULL a NOT-NULL column.
type Patch = Record<string, unknown>;

export function copyOptStr(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = optStr(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyOptBool(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = optBool(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyNullStr(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = nullStr(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyNullNum(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = nullNum(args, key);
  if (v !== undefined) out[key] = v;
}
