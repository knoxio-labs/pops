import { createHash } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  MOBILE_CAPABILITIES,
  isMobileCapability,
  resolveDeviceCapabilities,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import {
  DeviceGrantSchema,
  ReplaceDeviceGrantSchema,
} from '../../contract/device-grant-schemas.js';
import { devices } from '../schema.js';

import type { DeviceGrant, ReplaceDeviceGrant } from '../../contract/device-grant-schemas.js';
import type { BfmDb } from '../open-bfm-db.js';
import type { DeviceRow } from '../schema.js';

/** Revoked/guest rows are never editable; malformed or unknown-version state fails closed. */
export type DeviceGrantResult =
  | { outcome: 'ok'; grant: DeviceGrant }
  | { outcome: 'not-found' | 'forbidden' | 'conflict' };

function policyToken(row: DeviceRow): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        device: { id: row.id, createdAt: row.createdAt },
        vocabulary: MOBILE_CAPABILITIES,
        defaults: DEFAULT_DEVICE_CAPABILITIES,
        guests: GUEST_DEVICE_CAPABILITIES,
      })
    )
    .digest('hex');
}
function project(row: DeviceRow): DeviceGrantResult {
  if (row.revokedAt !== null || row.subjectEmail !== null) return { outcome: 'forbidden' };
  let stored: unknown;
  try {
    stored = JSON.parse(row.capabilities);
  } catch {
    return { outcome: 'conflict' };
  }
  const strings = z.array(z.string()).safeParse(stored);
  if (!strings.success) return { outcome: 'conflict' };
  const grant = DeviceGrantSchema.safeParse({
    id: row.id,
    revision: row.capabilityRevision,
    policyToken: policyToken(row),
    mode: row.capabilityMode,
    stored: strings.data,
    effective: resolveDeviceCapabilities(row),
    selectable: [...MOBILE_CAPABILITIES],
  });
  return grant.success ? { outcome: 'ok', grant: grant.data } : { outcome: 'conflict' };
}

/** Read only one operator-owned live device's grant; never emits key/token/subject data. */
export function readDeviceGrant(db: BfmDb, id: string): DeviceGrantResult {
  const row = db.select().from(devices).where(eq(devices.id, id)).get();
  return row === undefined ? { outcome: 'not-found' } : project(row);
}

/** Atomic complete selection, always explicit. CAS includes policy drift and does not accept ABA revisions. */
export function replaceDeviceGrant(
  db: BfmDb,
  id: string,
  request: ReplaceDeviceGrant
): DeviceGrantResult {
  const input = ReplaceDeviceGrantSchema.parse(request);
  return db.transaction(
    (tx): DeviceGrantResult => {
      const existing = readDeviceGrant(tx, id);
      if (existing.outcome !== 'ok') return existing;
      const { grant } = existing;
      if (
        grant.revision !== input.expectedRevision ||
        grant.policyToken !== input.expectedPolicyToken ||
        grant.revision === Number.MAX_SAFE_INTEGER ||
        !grant.stored.every(isMobileCapability)
      )
        return { outcome: 'conflict' };
      const changed = tx
        .update(devices)
        .set({
          capabilities: serialiseDeviceCapabilities(input.capabilities),
          capabilityMode: 'explicit',
          capabilityRevision: grant.revision + 1,
        })
        .where(
          and(
            eq(devices.id, id),
            eq(devices.capabilityRevision, grant.revision),
            isNull(devices.revokedAt),
            isNull(devices.subjectEmail)
          )
        )
        .run();
      if (changed.changes !== 1) return { outcome: 'conflict' };
      return readDeviceGrant(tx, id);
    },
    { behavior: 'immediate' }
  );
}
