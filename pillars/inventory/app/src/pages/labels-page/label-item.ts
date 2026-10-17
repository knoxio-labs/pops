import type { WebListResponses } from '../../inventory-api/types.gen.js';

/** One inventory item returned by the web read API for label preparation. */
export type WebItem = WebListResponses[200]['items'][number];
