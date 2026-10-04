import { getPillar } from '../pillar-client.js';
import { watchHistoryMediaUri } from './media-uri.js';
import { mapRows, withUri } from './uri.js';
import { mapCallResult, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type RecentWatchHistoryInput = {
  mediaType?: 'movie' | 'episode';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

type MediaReadShape = {
  movies: { get: (input: { id: number }) => unknown };
  tvShows: { get: (input: { id: number }) => unknown };
  watchHistory: { listRecent: (input: RecentWatchHistoryInput) => unknown };
};

function media(): PillarHandle<MediaReadShape> {
  return getPillar<MediaReadShape>('media');
}

const movieGet: ToolDef = {
  name: 'media.movies.get',
  readOnly: true,
  description: 'Get one movie from the media library by its positive integer library ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        minimum: 1,
        multipleOf: 1,
        description: 'Positive integer media-library ID',
      },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = args['id'];
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return toolError('id must be a positive integer.');
    }
    const result = await media().movies.get({ id });
    return mapCallResult(mapRows(result, 'data', withUri('media/movie')));
  },
};

const tvShowGet: ToolDef = {
  name: 'media.tvShows.get',
  readOnly: true,
  description: 'Get one TV show from the media library by its positive integer library ID.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        minimum: 1,
        multipleOf: 1,
        description: 'Positive integer media-library ID',
      },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = args['id'];
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return toolError('id must be a positive integer.');
    }
    const result = await media().tvShows.get({ id });
    return mapCallResult(mapRows(result, 'data', withUri('media/tv-show')));
  },
};

const watchHistoryRecent: ToolDef = {
  name: 'media.watchHistory.recent',
  readOnly: true,
  description:
    'List recent movie and episode watch-history entries. startDate and endDate are ISO 8601 date-times.',
  inputSchema: {
    type: 'object',
    properties: {
      mediaType: {
        type: 'string',
        enum: ['movie', 'episode'],
        description: 'Filter to movies or episodes',
      },
      startDate: {
        type: 'string',
        format: 'date-time',
        description: 'Inclusive ISO 8601 date-time lower bound',
      },
      endDate: {
        type: 'string',
        format: 'date-time',
        description: 'Inclusive ISO 8601 date-time upper bound',
      },
      limit: { type: 'number', minimum: 1, maximum: 500, description: 'Max results, 1-500' },
      offset: { type: 'number', minimum: 0, description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const input: RecentWatchHistoryInput = {};
    if (args['mediaType'] === 'movie' || args['mediaType'] === 'episode') {
      input.mediaType = args['mediaType'];
    }
    if (typeof args['startDate'] === 'string') input.startDate = args['startDate'];
    if (typeof args['endDate'] === 'string') input.endDate = args['endDate'];
    if (typeof args['limit'] === 'number') input.limit = args['limit'];
    if (typeof args['offset'] === 'number') input.offset = args['offset'];

    const result = await media().watchHistory.listRecent(input);
    return mapCallResult(mapRows(result, 'data', watchHistoryMediaUri));
  },
};

export const mediaReadTools: readonly ToolDef[] = [movieGet, tvShowGet, watchHistoryRecent];
