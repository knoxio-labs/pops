import { createSelectSchema } from 'drizzle-zod';

import { events } from './events.js';
import { items } from './items.js';
import { media } from './media.js';
import { mutations } from './mutations.js';
import { syncMeta } from './sync-meta.js';

/** Zod schema of an `items` row as selected. */
export const itemsRowSchema = createSelectSchema(items);
/** Zod schema of an `events` row as selected. */
export const eventsRowSchema = createSelectSchema(events);
/** Zod schema of a `mutations` row as selected. */
export const mutationsRowSchema = createSelectSchema(mutations);
/** Zod schema of a `media` row as selected. */
export const mediaRowSchema = createSelectSchema(media);
/** Zod schema of a `sync_meta` row as selected. */
export const syncMetaRowSchema = createSelectSchema(syncMeta);
