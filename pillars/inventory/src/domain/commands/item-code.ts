import { and, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { items } from '../../db/index.js';
import { requireItem, type CommandDb } from './entities.js';
import { CommandConflict } from './errors.js';
import { defineOp } from './op.js';
import { upsertSearchIndex } from './search-index.js';

const setCodeArgs = z.object({ code: z.string().trim().min(1).max(64).nullable() });

interface CodeHolder {
  readonly id: string;
  readonly name: string;
}

/** The other, non-tombstoned item already holding `code` (case-insensitive), if any. */
function findCodeHolder(db: CommandDb, code: string, excludeId: string): CodeHolder | undefined {
  return db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(
      and(
        sql`${items.code} = ${code} COLLATE NOCASE`,
        ne(items.id, excludeId),
        sql`${items.deletedAt} IS NULL`
      )
    )
    .get();
}

const STEM_PATTERN = /^(.*?)(\d+)$/;

/**
 * The next code after `code` that keeps its stem and is not held by another
 * item (`B412` to `B413`), or `null` when `code` has no trailing digits to
 * increment. Tries up to 1000 candidates so a long run of held codes cannot
 * loop forever.
 */
export function suggestNextCode(db: CommandDb, code: string, excludeId: string): string | null {
  const match = STEM_PATTERN.exec(code);
  if (!match) return null;
  const stem = match[1] ?? '';
  const digits = match[2] ?? '';
  const width = digits.length;
  let n = Number.parseInt(digits, 10);
  for (let tries = 0; tries < 1000; tries += 1) {
    n += 1;
    const candidate = `${stem}${String(n).padStart(width, '0')}`;
    if (!findCodeHolder(db, candidate, excludeId)) return candidate;
  }
  return null;
}

/**
 * `item.setCode { code }`: set or clear an item's sticker code. Unique
 * case-insensitively; a collision is a `code_collision` conflict naming the
 * holder and a deterministic suggestion (ADR-002 D7), never a silent
 * rewrite. Clearing (`code: null`) never collides.
 */
export const itemSetCode = defineOp({
  op: 'item.setCode',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: setCodeArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    if (args.code !== null) {
      const holder = findCodeHolder(ctx.db, args.code, row.id);
      if (holder) {
        throw new CommandConflict({
          kind: 'code_collision',
          heldBy: holder,
          suggestedCode: suggestNextCode(ctx.db, args.code, row.id),
        });
      }
    }
    return {
      eventKind: 'code_set',
      changes: { code: args.code },
      effects(effectCtx) {
        upsertSearchIndex(effectCtx.db, {
          id: row.id,
          name: row.name,
          code: args.code,
          note: row.note,
          typeKey: row.typeKey,
          fields: row.fields,
          externalIds: row.externalIds,
        });
      },
    };
  },
});
