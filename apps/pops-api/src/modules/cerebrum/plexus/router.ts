/**
 * tRPC router for cerebrum.plexus (PRD-090).
 *
 * Exposes adapter management and ingestion filter CRUD. The router is a thin
 * adapter over the lifecycle manager and database — no business logic here.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDb } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

import type { PlexusAdapter, PlexusAdapterRow, PlexusFilter, PlexusFilterRow } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToAdapter(row: PlexusAdapterRow): PlexusAdapter {
  let config: Record<string, unknown> | null = null;
  if (row.config) {
    try {
      config = JSON.parse(row.config) as Record<string, unknown>;
    } catch {
      config = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    config,
    lastHealth: row.last_health,
    lastError: row.last_error,
    ingestedCount: row.ingested_count,
    emittedCount: row.emitted_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFilter(row: PlexusFilterRow): PlexusFilter {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    filterType: row.filter_type,
    field: row.field,
    pattern: row.pattern,
    enabled: row.enabled === 1,
  };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const adapterIdSchema = z.object({ adapterId: z.string().min(1) });

const filterDefinitionSchema = z.object({
  filterType: z.enum(['include', 'exclude']),
  field: z.string().min(1),
  pattern: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

const setFiltersSchema = z.object({
  adapterId: z.string().min(1),
  filters: z.array(filterDefinitionSchema),
});

// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------

const adaptersRouter = router({
  /** List all registered adapters. */
  list: protectedProcedure.query(() => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM plexus_adapters ORDER BY name')
      .all() as PlexusAdapterRow[];
    return { adapters: rows.map(rowToAdapter) };
  }),

  /** Get a single adapter by ID. */
  get: protectedProcedure.input(adapterIdSchema).query(({ input }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM plexus_adapters WHERE id = ?').get(input.adapterId) as
      | PlexusAdapterRow
      | undefined;
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Adapter '${input.adapterId}' not found` });
    }
    return { adapter: rowToAdapter(row) };
  }),

  /** Run a health check on a specific adapter. */
  healthCheck: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    // Lazy-import to avoid circular dependency at module load time.
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const result = await lifecycle.healthCheck(input.adapterId);
    return result;
  }),

  /** Trigger a manual sync for an adapter. */
  sync: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const result = await lifecycle.sync(input.adapterId);
    return result;
  }),

  /** Unregister (shutdown + remove) an adapter. */
  unregister: protectedProcedure.input(adapterIdSchema).mutation(async ({ input }) => {
    const { getPlexusLifecycle } = await import('./instance.js');
    const lifecycle = getPlexusLifecycle();
    const success = await lifecycle.unregister(input.adapterId);
    return { success };
  }),
});

const filtersRouter = router({
  /** List filters for an adapter. */
  list: protectedProcedure.input(adapterIdSchema).query(({ input }) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM plexus_filters WHERE adapter_id = ? ORDER BY id')
      .all(input.adapterId) as PlexusFilterRow[];
    return { filters: rows.map(rowToFilter) };
  }),

  /** Replace all filters for an adapter (atomic). */
  set: protectedProcedure.input(setFiltersSchema).mutation(({ input }) => {
    const db = getDb();

    // Verify adapter exists.
    const adapter = db
      .prepare('SELECT id FROM plexus_adapters WHERE id = ?')
      .get(input.adapterId) as { id: string } | undefined;
    if (!adapter) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Adapter '${input.adapterId}' not found`,
      });
    }

    // Validate regex patterns.
    for (const f of input.filters) {
      try {
        new RegExp(f.pattern);
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid regex pattern '${f.pattern}' for field '${f.field}'`,
        });
      }
    }

    // Full replace in a transaction.
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM plexus_filters WHERE adapter_id = ?').run(input.adapterId);
      const insert = db.prepare(
        'INSERT INTO plexus_filters (id, adapter_id, filter_type, field, pattern, enabled) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const [i, f] of input.filters.entries()) {
        insert.run(
          `pxf_${input.adapterId}_${i}`,
          input.adapterId,
          f.filterType,
          f.field,
          f.pattern,
          f.enabled ? 1 : 0
        );
      }
    });
    txn();

    // Return the updated filter list.
    const rows = db
      .prepare('SELECT * FROM plexus_filters WHERE adapter_id = ? ORDER BY id')
      .all(input.adapterId) as PlexusFilterRow[];
    return { filters: rows.map(rowToFilter) };
  }),
});

// ---------------------------------------------------------------------------
// Composed plexus router
// ---------------------------------------------------------------------------

export const plexusRouter = router({
  adapters: adaptersRouter,
  filters: filtersRouter,
});
