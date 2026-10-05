import { readPath, type UriTypeResolver } from './resolver.js';

/** Resolves Cerebrum engram object URIs. */
export const engramUriResolvers: readonly UriTypeResolver[] = [
  {
    key: 'cerebrum/engram',
    tool: 'cerebrum.engrams.get',
    args: (id) => (id.length === 0 ? null : { id }),
    describe: (payload) => {
      const title = readPath(payload, 'engram', 'title');
      if (typeof title !== 'string') return null;

      const type = readPath(payload, 'engram', 'type');
      return { title, ...(typeof type === 'string' ? { subtitle: type } : {}) };
    },
  },
];
