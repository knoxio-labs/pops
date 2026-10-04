import { engramUriResolvers } from './resolvers-engram.js';
import { financeUriResolvers } from './resolvers-finance.js';

import type { UriTypeResolver } from './resolver.js';

/** URI resolvers available to Ego entity lookup. */
export const defaultUriResolvers: readonly UriTypeResolver[] = [
  ...financeUriResolvers,
  ...engramUriResolvers,
];
