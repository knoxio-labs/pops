/**
 * Handlers for the `session.*` sub-router.
 *
 * Gates on `requireSession`, the only gate a guest passes: a service account
 * or an anonymous caller bounces with a 401 envelope.
 */
import { readPrincipal, requireSession } from '../middleware/identity.js';
import { runHttp } from './error-mapping.js';

import type { Response } from 'express';

export function makeSessionHandlers() {
  return {
    get: ({ res }: { res: Response }) =>
      runHttp(() => {
        const user = requireSession(readPrincipal(res));
        return {
          status: 200 as const,
          body: { kind: user.kind, email: user.accessVerified ? user.email : null },
        };
      }),
  };
}
