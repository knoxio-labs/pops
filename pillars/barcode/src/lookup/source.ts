import type { Product } from './product.js';

/** The result an injected book source returns for one ISBN-13. */
export type SourceAnswer =
  | { kind: 'hit'; product: Product }
  | { kind: 'miss' }
  | { kind: 'unavailable' };

/** Adapter contract for an ordered ISBN-13 book source. */
export interface BookSource {
  readonly id: 'open_library' | 'google_books';
  lookUp(isbn13: string, signal: AbortSignal): Promise<SourceAnswer>;
}

export type { Product } from './product.js';
