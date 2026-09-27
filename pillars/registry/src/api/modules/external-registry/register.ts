import { defineErrors } from '@pops/pillar-express';
import { validateManifestPayload } from '@pops/pillar-sdk';

/**
 * HTTP-JSON register handler for external pillars.
 *
 * External pillars — those that ship from a different repository and run
 * outside the in-tree `bootstrapPillar` path — register themselves with the
 * registry pillar by POSTing the register route. Both the canonical
 * `/registry/register` and the legacy `/core.registry.register` form are
 * mounted on the same handler (see `app.ts`); the SDK prefers the slash form
 * and falls back to the dotted form on 404. The nginx edge blocks the mutating
 * registry paths from external traffic, then carves a sibling allow-list
 * covering both the `^/core\.registry\.(register|heartbeat|deregister)$`
 * and `^/registry/(register|heartbeat|deregister)$` forms for this plain
 * HTTP-JSON surface. Both blocks are rendered by
 * `pillars/shell/scripts/generate-nginx-conf.ts`.
 *
 * Trust model (ADR-027): the docker network is the boundary. Anything
 * able to POST here is already inside the compose network — the
 * external-vs-internal distinction is captured by the `origin` column,
 * not by per-request authentication.
 */
import { pillarRegistryService, type CoreDb } from '../../../db/index.js';
import { emitRegistryEvent } from '../registry/event-bus.js';
import { toRegistryEntry } from '../registry/snapshot.js';
import { registryNow } from '../registry/status.js';
import {
  HEARTBEAT_INTERVAL_MS,
  PILLAR_ID_PATTERN,
  parseRegisterBody,
  type ValidRegisterBody,
} from './register-helpers.js';

import type { Request, Response } from 'express';

export interface ExternalRegisterDeps {
  readonly coreDb: CoreDb;
}

const registrationErrors = defineErrors('registry', {
  invalid: {
    area: 'registration',
    status: 400,
    message: 'The pillar registration is invalid.',
    retryable: false,
  },
});

function assertPillarIdShape(pillarId: string): void {
  if (PILLAR_ID_PATTERN.test(pillarId)) return;
  return registrationErrors.invalid({
    issues: [
      {
        field: 'pillarId',
        reason: `pillarId must match ${PILLAR_ID_PATTERN.toString()}`,
        got: pillarId,
        schemaPath: ['pillarId'],
      },
    ],
  });
}

function assertManifestPillarMatches(pillarId: string, manifestPillar: string): void {
  if (manifestPillar === pillarId) return;
  return registrationErrors.invalid({
    issues: [
      {
        field: 'manifest.pillar',
        reason: 'manifest.pillar must equal pillarId',
        got: manifestPillar,
        schemaPath: ['manifest', 'pillar'],
      },
    ],
  });
}

function persistAndRespond(
  deps: ExternalRegisterDeps,
  body: ValidRegisterBody,
  res: Response
): void {
  const { pillarId, baseUrl, manifest, capabilities } = body;
  const validation = validateManifestPayload(manifest);
  if (!validation.ok) {
    return registrationErrors.invalid({ issues: validation.issues });
  }
  assertManifestPillarMatches(pillarId, validation.payload.pillar);

  const now = registryNow();
  const persisted = pillarRegistryService.upsertPillarRegistration(deps.coreDb, {
    baseUrl,
    manifest: validation.payload,
    now: now.toISOString(),
    origin: 'external',
    apiKeyHash: null,
    ...(capabilities === undefined ? {} : { capabilities }),
  });

  const entry = toRegistryEntry(persisted, now);
  emitRegistryEvent({ event: 'registered', pillarId: entry.pillarId, entry });

  res.status(200).json({
    ok: true,
    pillarId: persisted.pillarId,
    registeredAt: persisted.registeredAt,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  });
}

export type ExternalRegisterHandler = (req: Request, res: Response) => void;

export function createExternalRegisterHandler(deps: ExternalRegisterDeps): ExternalRegisterHandler {
  return function externalRegisterHandler(req, res) {
    const parsed = parseRegisterBody(req.body);
    if (!parsed.ok) {
      return registrationErrors.invalid({ issues: parsed.issues });
    }

    assertPillarIdShape(parsed.value.pillarId);

    persistAndRespond(deps, parsed.value, res);
  };
}
