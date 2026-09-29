import type { z } from 'zod';

import type { Protocol1Fields, ReadItemFieldValue } from '../../catalogue/index.js';
import type { SyncComputedValue } from '../../contract/rest-sync-computed-schemas.js';
import type {
  SyncItemFieldValueSchema,
  SyncItemIssueSchema,
  SyncItemSchema,
  SyncLocationSchema,
  SyncPhotoSchema,
} from '../../contract/rest-sync-schemas.js';
import type { ItemRow } from '../../db/index.js';

/** An item on the sync wire. */
export type SyncItem = z.infer<typeof SyncItemSchema>;
/** A non-fatal item projection issue returned beside a sync page. */
export type SyncItemIssue = z.infer<typeof SyncItemIssueSchema>;
/** A location on the sync wire. */
export type SyncLocation = z.infer<typeof SyncLocationSchema>;
/** A canonical field-value group on the sync wire. */
export type SyncItemFieldValue = z.infer<typeof SyncItemFieldValueSchema>;
export type SyncPhoto = z.infer<typeof SyncPhotoSchema>;

/** A non-fatal failure while preparing one item's sync projection. */
export interface SyncItemProjectionIssue {
  readonly fieldId: string | null;
  readonly fieldKey: string | null;
  readonly code: string;
  readonly message: string;
}

/** What a page needs about its items beyond their own rows. */
export interface ItemExtras {
  /** Protocol-1 field projection per item, loaded in the page's read transaction. */
  readonly fields: ReadonlyMap<string, Protocol1Fields>;
  /** Canonical protocol-2 values grouped under their stable field IDs. */
  readonly fieldValues: ReadonlyMap<string, readonly ReadItemFieldValue[]>;
  /** Effective computed-field values, evaluated against the active catalogue. */
  readonly computedValues: ReadonlyMap<string, readonly SyncComputedValue[]>;
  /** Protocol-1 type key per item, loaded from the same published catalogue snapshot. */
  readonly typeKeys: ReadonlyMap<string, string | null>;
  /** Content-addressed photos per item, in position order. */
  readonly photos: ReadonlyMap<string, SyncPhoto[]>;
  /** Titles of each linked Paperless document, per item. */
  readonly documentTitles: ReadonlyMap<string, string[]>;
  /** Items with at least one Paperless link, titled or not. */
  readonly linked: ReadonlySet<string>;
  /** Projection issues grouped by item ID, without hiding the affected item. */
  readonly projectionIssues: ReadonlyMap<string, readonly SyncItemProjectionIssue[]>;
}

/** Rows read for a page before its asynchronous Paperless check. */
export interface ItemPageRows {
  readonly items: readonly ItemRow[];
  readonly extras: ItemExtras;
}
