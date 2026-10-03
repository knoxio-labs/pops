/** Persistence for the per-conversation Ego allowed-tool list. */
import { eq } from 'drizzle-orm';

import { conversations } from '../schema.js';

import type { CerebrumDb } from './internal.js';

function parseAllowedTools(value: string | null): string[] {
  if (value == null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((tool) => typeof tool === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

/** Read one conversation's allowed tool names; unknown or invalid data returns an empty list. */
export function getAllowedTools(db: CerebrumDb, id: string): string[] {
  const row = db
    .select({ allowedTools: conversations.allowedTools })
    .from(conversations)
    .where(eq(conversations.id, id))
    .get();
  return parseAllowedTools(row?.allowedTools ?? null);
}

/** Merge allowed tool names in first-seen order; return null when the conversation is missing. */
export function addAllowedTools(
  db: CerebrumDb,
  id: string,
  tools: readonly string[]
): string[] | null {
  const row = db
    .select({ allowedTools: conversations.allowedTools })
    .from(conversations)
    .where(eq(conversations.id, id))
    .get();
  if (!row) return null;

  const allowedTools = [...new Set([...parseAllowedTools(row.allowedTools), ...tools])];
  const changed = db
    .update(conversations)
    .set({ allowedTools: JSON.stringify(allowedTools) })
    .where(eq(conversations.id, id))
    .run().changes;
  return changed === 1 ? allowedTools : null;
}
