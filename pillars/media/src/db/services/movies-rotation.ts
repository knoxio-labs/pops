/**
 * Rotation-status writes against the movies table. Kept separate from
 * `movies.ts` so that file stays within the per-file line cap.
 */
import { eq } from 'drizzle-orm';

import { movies } from '../schema.js';
import { getMovie, type MovieRow } from './movies.js';

import type { MediaDb } from './internal.js';

/** Rotation status a movie can carry. Mirrors the `movies.rotationStatus` enum. */
export type RotationStatus = NonNullable<MovieRow['rotationStatus']>;

/**
 * Set (or clear) a movie's rotation status by id, together with the expiry that
 * bounds it. Throws `MovieNotFoundError` if the movie is missing.
 *
 * `expiresAt` is mandatory rather than optional because the removal filter
 * treats a `protected` row with no expiry as unprotected: it only skips a row
 * whose `rotationExpiresAt` is still in the future. A caller that forgot to
 * pass one would silently protect nothing, which is exactly the defect this
 * signature exists to prevent.
 */
export function setRotationStatus(
  db: MediaDb,
  id: number,
  status: RotationStatus | null,
  expiresAt: string | null
): MovieRow {
  getMovie(db, id);
  db.update(movies)
    .set({
      rotationStatus: status,
      rotationExpiresAt: status === null ? null : expiresAt,
      rotationMarkedAt: new Date().toISOString(),
    })
    .where(eq(movies.id, id))
    .run();
  return getMovie(db, id);
}
