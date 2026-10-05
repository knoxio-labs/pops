import { objectUri } from './uri.js';

import type { Row } from './uri.js';

/** Add the addressable movie or TV-show URI to a watchlist row. */
export function watchlistMediaUri(row: Row): Row {
  const mediaType = row['mediaType'];
  const mediaId = row['mediaId'];
  if (!isUriId(mediaId)) return row;

  if (mediaType === 'movie') {
    return { ...row, mediaUri: objectUri('media/movie', mediaId) };
  }
  if (mediaType === 'tv_show') {
    return { ...row, mediaUri: objectUri('media/tv-show', mediaId) };
  }
  return row;
}

/** Add the owning movie or TV-show URI to an enriched watch-history row. */
export function watchHistoryMediaUri(row: Row): Row {
  const mediaType = row['mediaType'];
  if (mediaType === 'movie' && isUriId(row['mediaId'])) {
    return { ...row, mediaUri: objectUri('media/movie', row['mediaId']) };
  }
  if (mediaType === 'episode' && isUriId(row['tvShowId'])) {
    return { ...row, mediaUri: objectUri('media/tv-show', row['tvShowId']) };
  }
  return row;
}

function isUriId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
