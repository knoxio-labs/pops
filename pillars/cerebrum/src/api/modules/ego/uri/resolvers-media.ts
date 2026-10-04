import { readPath, type UriTypeResolver } from './resolver.js';

/** Resolves media movie and TV-show object URIs through the gateway. */
export const mediaUriResolvers: readonly UriTypeResolver[] = [
  {
    key: 'media/movie',
    tool: 'media.movies.get',
    args: mediaIdArgs,
    describe: (payload) => {
      const title = readPath(payload, 'data', 'title');
      if (typeof title !== 'string') return null;

      const releaseDate = readPath(payload, 'data', 'releaseDate');
      const subtitle = yearSubtitle(releaseDate);
      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
  {
    key: 'media/tv-show',
    tool: 'media.tvShows.get',
    args: mediaIdArgs,
    describe: (payload) => {
      const title = readPath(payload, 'data', 'name');
      if (typeof title !== 'string') return null;

      const firstAirDate = readPath(payload, 'data', 'firstAirDate');
      const subtitle = yearSubtitle(firstAirDate);
      return { title, ...(subtitle === undefined ? {} : { subtitle }) };
    },
  },
];

function mediaIdArgs(id: string): { id: number } | null {
  const mediaId = Number(id);
  return Number.isInteger(mediaId) && mediaId > 0 ? { id: mediaId } : null;
}

function yearSubtitle(value: unknown): string | undefined {
  return typeof value === 'string' && value.length >= 4 ? value.slice(0, 4) : undefined;
}
