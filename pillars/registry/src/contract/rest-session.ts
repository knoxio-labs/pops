/**
 * `session.*` sub-router — who is signed in.
 *
 * The one read the shell makes to decide what to render: the operator sees
 * everything, a guest only what they were granted. It is the only registry
 * route a guest may call; every other identity-gated route answers a guest 403.
 *
 * `email` is the address Cloudflare Access verified. It is `null` for an
 * operator who arrived without an Access token (LAN, Tailscale, a dev
 * machine), where there is no verified address to report.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { guestRoute } from '@pops/pillar-sdk/server';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the session read. */
export const SessionSchema = z.object({
  kind: z.enum(['operator', 'guest']),
  email: z.string().nullable(),
});

export const coreSessionContract = c.router({
  get: {
    method: 'GET',
    path: '/session',
    responses: { 200: SessionSchema, 401: ErrorBodySchema },
    summary: 'Read who is signed in: the operator or a guest, and their verified email',
    metadata: guestRoute(),
  },
});
