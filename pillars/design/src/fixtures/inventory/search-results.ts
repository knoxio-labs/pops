/**
 * What the search screens open on: the recents shown before anything is
 * typed, and the queries each design state runs. Results themselves are
 * computed by the search model over the browse population, so a state
 * cannot show a hit the model would not return.
 */
import { paletteSource } from './palette-source';
import { recentQueries } from './recents';

import type { PaletteCommand } from '@/kit/inventory/shared/contracts';

/** Recent queries, newest first. */
export const searchRecentQueries: readonly string[] = recentQueries;

/** Records opened recently, as the palette and the search page list them. */
export const searchRecentRecords: readonly PaletteCommand[] = paletteSource.recents;

/** The queries the design states run. */
export const SEARCH_QUERIES = {
  results: 'cable',
  exactCode: 'k12',
  container: 'kitchen',
  place: 'garage',
  purchase: 'cable',
  typeTree: 'sheet',
  none: 'snorkel',
} as const;
