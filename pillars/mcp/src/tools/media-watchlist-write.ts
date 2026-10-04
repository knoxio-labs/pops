import { getPillar } from '../pillar-client.js';
import { watchlistMediaUri } from './media-uri.js';
import { mapRows } from './uri.js';
import { mapCallResult, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type WatchlistAddInput = {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
  priority?: number;
  notes?: string;
};

type MediaShape = {
  watchlist: {
    add: (input: WatchlistAddInput) => unknown;
  };
};

const WATCHLIST_ADD_SCOPE = 'media.watchlist.add';

function media(): PillarHandle<MediaShape> {
  return getPillar<MediaShape>('media');
}

export const watchlistAdd: ToolDef = {
  name: 'media.watchlist.add',
  readOnly: false,
  scope: WATCHLIST_ADD_SCOPE,
  description:
    'Add a movie or TV show to the watchlist. This is idempotent by mediaType and mediaId. mediaId must be the library ID returned by media.library.list, not an external catalogue ID.',
  inputSchema: {
    type: 'object',
    properties: {
      mediaType: {
        type: 'string',
        enum: ['movie', 'tv_show'],
        description: 'Media type to add',
      },
      mediaId: {
        type: 'number',
        minimum: 1,
        multipleOf: 1,
        description: 'Positive integer library ID returned by media.library.list',
      },
      priority: {
        type: 'number',
        minimum: 0,
        multipleOf: 1,
        description: 'Optional non-negative integer priority',
      },
      notes: { type: 'string', description: 'Optional note for this watchlist entry' },
    },
    required: ['mediaType', 'mediaId'],
  },
  handler: async (args) => {
    const mediaType = args['mediaType'];
    if (mediaType !== 'movie' && mediaType !== 'tv_show') {
      return toolError('mediaType must be "movie" or "tv_show".');
    }

    const mediaId = args['mediaId'];
    if (typeof mediaId !== 'number' || !Number.isInteger(mediaId) || mediaId <= 0) {
      return toolError('mediaId must be a positive integer.');
    }

    const input: WatchlistAddInput = { mediaType, mediaId };

    if (args['priority'] !== undefined) {
      const priority = args['priority'];
      if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0) {
        return toolError('priority must be a non-negative integer.');
      }
      input.priority = priority;
    }

    if (args['notes'] !== undefined) {
      const notes = args['notes'];
      if (typeof notes !== 'string') return toolError('notes must be a string.');
      input.notes = notes;
    }

    const result = await media().watchlist.add(input);
    return mapCallResult(mapRows(result, 'data', watchlistMediaUri), WATCHLIST_ADD_SCOPE);
  },
};
