/**
 * Database helpers for the Plexus lifecycle manager (PRD-090).
 *
 * Extracted from lifecycle.ts to keep the main class under the line limit.
 */
import { getDb } from '../../../db.js';

import type {
  AdapterStatusValue,
  FilterDefinition,
  FilterRule,
  FilterType,
  PlexusAdapterRow,
} from './types.js';

export function upsertAdapterRow(
  adapterId: string,
  name: string,
  settings: Record<string, unknown>,
  now: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO plexus_adapters (id, name, status, config, created_at, updated_at)
     VALUES (?, ?, 'registered', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = 'registered',
       config = excluded.config,
       last_error = NULL,
       updated_at = excluded.updated_at`
  ).run(adapterId, name, JSON.stringify(settings), now, now);
}

export function updateAdapterStatus(
  adapterId: string,
  status: AdapterStatusValue,
  error?: string
): void {
  const db = getDb();
  db.prepare(
    'UPDATE plexus_adapters SET status = ?, last_error = ?, updated_at = ? WHERE id = ?'
  ).run(status, error ?? null, new Date().toISOString(), adapterId);
}

export function updateAdapterLastHealth(adapterId: string): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.prepare('UPDATE plexus_adapters SET last_health = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    adapterId
  );
}

export function getAdapterRow(adapterId: string): PlexusAdapterRow {
  const db = getDb();
  const row = db.prepare('SELECT * FROM plexus_adapters WHERE id = ?').get(adapterId) as
    | PlexusAdapterRow
    | undefined;
  if (!row) throw new Error(`Adapter row '${adapterId}' not found`);
  return row;
}

export function deleteAdapter(adapterId: string): boolean {
  const db = getDb();
  db.prepare('DELETE FROM plexus_filters WHERE adapter_id = ?').run(adapterId);
  const result = db.prepare('DELETE FROM plexus_adapters WHERE id = ?').run(adapterId);
  return result.changes > 0;
}

export function incrementIngestedCount(adapterId: string, count: number): void {
  const db = getDb();
  db.prepare(
    'UPDATE plexus_adapters SET ingested_count = ingested_count + ?, updated_at = ? WHERE id = ?'
  ).run(count, new Date().toISOString(), adapterId);
}

export function getEnabledFilterRows(adapterId: string): FilterRule[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT filter_type, field, pattern, enabled FROM plexus_filters WHERE adapter_id = ? AND enabled = 1'
    )
    .all(adapterId) as Array<{
    filter_type: string;
    field: string;
    pattern: string;
    enabled: number;
  }>;
  return rows.map((r) => ({
    filterType: r.filter_type as FilterType,
    field: r.field,
    pattern: r.pattern,
    enabled: r.enabled === 1,
  }));
}

export function syncFilterRows(adapterId: string, filters: FilterDefinition[]): void {
  const db = getDb();
  db.prepare('DELETE FROM plexus_filters WHERE adapter_id = ?').run(adapterId);
  const insert = db.prepare(
    'INSERT INTO plexus_filters (id, adapter_id, filter_type, field, pattern, enabled) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const [i, f] of filters.entries()) {
    insert.run(
      `pxf_${adapterId}_${i}`,
      adapterId,
      f.filterType,
      f.field,
      f.pattern,
      f.enabled !== false ? 1 : 0
    );
  }
}
