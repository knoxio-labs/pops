import { and, eq } from 'drizzle-orm';

import { syncMeta, type SyncMetaKey } from '../db/index.js';

import type { CommandDb } from '../domain/commands/index.js';

/** Highest inventory sync protocol understood by this server build. */
export const SUPPORTED_INVENTORY_PROTOCOL = 2;

function requireMeta(db: CommandDb, key: SyncMetaKey): string {
  const row = db.select().from(syncMeta).where(eq(syncMeta.key, key)).get();
  if (row === undefined) throw new Error(`sync_meta has no ${key}; migration 0012 seeds it`);
  return row.value;
}

/** Reads the persistent minimum protocol enforced for every sync request. */
export function readMinimumProtocol(db: CommandDb): number {
  const minimumProtocol = Number.parseInt(requireMeta(db, 'min_protocol'), 10);
  if (!Number.isSafeInteger(minimumProtocol) || minimumProtocol < 1) {
    throw new Error('sync_meta.min_protocol is not a positive integer');
  }
  return minimumProtocol;
}

/** A protocol-minimum activation refusal with a stable API error code. */
export class ProtocolRolloutError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProtocolRolloutError';
  }
}

/**
 * Raises the persistent sync minimum with compare-and-swap semantics.
 * Protocol minimums never decrease because an accepted newer catalogue may
 * contain values an older writer cannot preserve.
 */
export function activateMinimumProtocol(
  db: CommandDb,
  expectedMinimumProtocol: number,
  minimumProtocol: number
): number {
  if (minimumProtocol > SUPPORTED_INVENTORY_PROTOCOL) {
    throw new ProtocolRolloutError(
      400,
      'protocol_not_supported',
      `This inventory build supports protocol ${SUPPORTED_INVENTORY_PROTOCOL}, not ${minimumProtocol}`
    );
  }

  return db.transaction((tx) => {
    const current = readMinimumProtocol(tx);
    if (current !== expectedMinimumProtocol) {
      throw new ProtocolRolloutError(
        409,
        'protocol_rollout_conflict',
        `The active minimum protocol is ${current}, not ${expectedMinimumProtocol}`
      );
    }
    if (minimumProtocol < current) {
      throw new ProtocolRolloutError(
        409,
        'protocol_minimum_downgrade',
        `The minimum protocol cannot decrease from ${current} to ${minimumProtocol}`
      );
    }
    if (minimumProtocol === current) return current;

    const updated = tx
      .update(syncMeta)
      .set({ value: String(minimumProtocol) })
      .where(
        and(eq(syncMeta.key, 'min_protocol'), eq(syncMeta.value, String(expectedMinimumProtocol)))
      )
      .run();
    if (updated.changes !== 1) {
      throw new ProtocolRolloutError(
        409,
        'protocol_rollout_conflict',
        'The active minimum protocol changed during activation'
      );
    }
    return minimumProtocol;
  });
}
