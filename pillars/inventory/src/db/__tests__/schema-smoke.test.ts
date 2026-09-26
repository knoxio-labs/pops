/**
 * Smoke test that every inventory schema export from `src/db/schema`
 * resolves with the expected drizzle SQL table `name`.
 *
 * Catches "table renamed but the export forgot to flip" mistakes. The set
 * must cover every exported table so a mismatch on either side trips here.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  deviceSyncLedgers,
  events,
  fixtures,
  itemConnections,
  itemDocuments,
  itemFixtureConnections,
  itemPhotos,
  items,
  itemUploadedFiles,
  locations,
  media,
  mutations,
  settings,
  syncMeta,
} from '../schema.js';

describe('inventory schema table names', () => {
  it.each([
    [deviceSyncLedgers, 'device_sync_ledgers'],
    [events, 'events'],
    [fixtures, 'fixtures'],
    [items, 'items'],
    [itemConnections, 'item_connections'],
    [itemDocuments, 'item_documents'],
    [itemFixtureConnections, 'item_fixture_connections'],
    [itemPhotos, 'item_photos'],
    [itemUploadedFiles, 'item_uploaded_files'],
    [locations, 'locations'],
    [media, 'media'],
    [mutations, 'mutations'],
    [settings, 'settings'],
    [syncMeta, 'sync_meta'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
