import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  resolveDeviceCapabilities,
} from '../../contract/capabilities.js';
import { devices, refreshTokens } from '../schema.js';
import { readDeviceGrant, replaceDeviceGrant } from '../services/device-grants.js';
import { deviceRow, openTempDb, refreshTokenRow, requireRow } from './helpers.js';

import type { DeviceGrant } from '../../contract/device-grant-schemas.js';
import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;
beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});
afterEach(() => cleanup());
function seed(overrides: Parameters<typeof deviceRow>[0] = {}) {
  const row = deviceRow(overrides);
  opened.db.insert(devices).values(row).run();
  return row.id;
}
function grant(id: string): DeviceGrant {
  const result = readDeviceGrant(opened.db, id);
  if (result.outcome !== 'ok') throw new Error('Expected editable grant');
  return result.grant;
}
function select(id: string, before: DeviceGrant, capabilities: DeviceGrant['selectable']) {
  return replaceDeviceGrant(opened.db, id, {
    expectedRevision: before.revision,
    expectedPolicyToken: before.policyToken,
    capabilities,
  });
}
function rows() {
  return opened.db.select().from(devices).all();
}

it('enables only explicit selected Trips writes and retains unrelated effective defaults without touching tokens or other devices', () => {
  const id = seed({ capabilityMode: 'tracks-default', capabilities: '["session.read"]' });
  const other = seed();
  const before = grant(id);
  opened.db.insert(refreshTokens).values(refreshTokenRow(id)).run();
  const tokens = opened.db.select().from(refreshTokens).all();
  const untouched = requireRow(
    rows().find((row) => row.id === other),
    'other'
  );
  expect(before.stored).toEqual(['session.read']);
  expect(before.effective).toEqual(DEFAULT_DEVICE_CAPABILITIES);
  const selection: DeviceGrant['selectable'] = [
    ...DEFAULT_DEVICE_CAPABILITIES,
    'trips.write',
    'trips.capture.write',
  ];
  const result = replaceDeviceGrant(opened.db, id, {
    expectedRevision: before.revision,
    expectedPolicyToken: before.policyToken,
    capabilities: selection,
  });
  expect(result.outcome).toBe('ok');
  const after = grant(id);
  expect(after.mode).toBe('explicit');
  expect(after.revision).toBe(before.revision + 1);
  expect(after.effective).toEqual(selection);
  expect(after.stored).toEqual(selection);
  expect(rows().find((row) => row.id === other)).toEqual(untouched);
  expect(opened.db.select().from(refreshTokens).all()).toEqual(tokens);
  expect(DEFAULT_DEVICE_CAPABILITIES).not.toContain('trips.write');
  expect(DEFAULT_DEVICE_CAPABILITIES).not.toContain('trips.capture.write');
});
it('rejects stale reads including A to B to A; empty selection stays empty', () => {
  const id = seed({ capabilities: '["session.read"]' });
  const a = grant(id);
  expect(select(id, a, ['session.read', 'trips.write']).outcome).toBe('ok');
  expect(select(id, grant(id), ['session.read']).outcome).toBe('ok');
  const before = rows();
  expect(select(id, a, ['trips.write']).outcome).toBe('conflict');
  expect(rows()).toEqual(before);
  expect(select(id, grant(id), []).outcome).toBe('ok');
  expect(
    resolveDeviceCapabilities(
      requireRow(
        rows().find((row) => row.id === id),
        'device'
      )
    )
  ).toEqual([]);
});
it('rejects a mismatched current policy token without changing any row', () => {
  const id = seed();
  const before = rows();
  const state = grant(id);
  expect(
    replaceDeviceGrant(opened.db, id, {
      expectedRevision: state.revision,
      expectedPolicyToken: '0'.repeat(64),
      capabilities: ['trips.write'],
    }).outcome
  ).toBe('conflict');
  expect(rows()).toEqual(before);
});
it.each([{ revokedAt: '2026-01-01T00:00:00.000Z' }, { subjectEmail: 'guest@example.test' }])(
  'rejects revoked and guest-bound devices unchanged: %j',
  (overrides) => {
    const id = seed(overrides);
    const before = rows();
    expect(readDeviceGrant(opened.db, id).outcome).toBe('forbidden');
    expect(
      replaceDeviceGrant(opened.db, id, {
        expectedRevision: 0,
        expectedPolicyToken: '0'.repeat(64),
        capabilities: ['trips.write'],
      }).outcome
    ).toBe('forbidden');
    expect(rows()).toEqual(before);
  }
);
it.each(['not-json', '{}', '[3]', '["future.unknown"]'])(
  'cannot silently repair/drop an unsupported stored grant: %s',
  (capabilities) => {
    const id = seed({ capabilities });
    const before = rows();
    const read = readDeviceGrant(opened.db, id);
    const token = read.outcome === 'ok' ? read.grant.policyToken : '0'.repeat(64);
    expect(
      replaceDeviceGrant(opened.db, id, {
        expectedRevision: 0,
        expectedPolicyToken: token,
        capabilities: ['session.read'],
      }).outcome
    ).toBe('conflict');
    expect(rows()).toEqual(before);
  }
);
it('refuses revision exhaustion and an unknown device without mutation', () => {
  const id = seed({ capabilityRevision: Number.MAX_SAFE_INTEGER });
  const before = rows();
  expect(select(id, grant(id), ['trips.write']).outcome).toBe('conflict');
  expect(readDeviceGrant(opened.db, crypto.randomUUID()).outcome).toBe('not-found');
  expect(rows()).toEqual(before);
});
it('failed SQLite write leaves both the grant and its revision untouched', () => {
  const id = seed();
  const state = grant(id);
  const before = rows();
  opened.raw.exec(
    "CREATE TRIGGER reject_grant BEFORE UPDATE OF capabilities ON devices BEGIN SELECT RAISE(ABORT, 'fixture failure'); END"
  );
  expect(() => select(id, state, ['trips.write'])).toThrow('fixture failure');
  expect(rows()).toEqual(before);
});
it('an unrelated last-seen update does not invalidate a grant decision', () => {
  const id = seed();
  const state = grant(id);
  opened.db
    .update(devices)
    .set({ lastSeenAt: '2026-01-01T00:00:00.000Z' })
    .where(eq(devices.id, id))
    .run();
  expect(select(id, state, ['session.read', 'trips.write']).outcome).toBe('ok');
  expect(rows().find((row) => row.id === id)?.lastSeenAt).toBe('2026-01-01T00:00:00.000Z');
});
