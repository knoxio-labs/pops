import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebSyncLedgerResponseSchema } from '../../contract/rest-sync-ledger.js';
import { granting, openSyncHarness, PROTOCOL, SYNC_KEY, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { z } from 'zod';

import type { SyncLedgerReportBodySchema } from '../../contract/rest-sync-ledger.js';
import type { Test } from './test-http.js';

const transport = createTestTransport();
const DAY_MS = 24 * 60 * 60 * 1000;
type LedgerReport = z.infer<typeof SyncLedgerReportBodySchema>;
type WebSyncLedger = z.infer<typeof WebSyncLedgerResponseSchema>;

let h: SyncHarness;

beforeEach(() => {
  h = openSyncHarness(transport, { verify: granting(['inventory.sync']) });
});

afterEach(() => h.close());

function report(overrides: Partial<LedgerReport> = {}): LedgerReport {
  return {
    reportedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
    attention: [],
    waiting: [],
    resolved: [],
    ...overrides,
  };
}

function deviceHeaders(deviceId: string, label: string): Record<string, string> {
  return {
    ...PROTOCOL,
    'x-api-key': SYNC_KEY,
    'Pops-Actor': `device:${deviceId};label=${encodeURIComponent(label)}`,
  };
}

async function postLedger(
  body: LedgerReport,
  deviceId = 'phone-1',
  label = "Joao's iPhone",
  headers: Record<string, string> = deviceHeaders(deviceId, label)
): Promise<Test> {
  return h.api.post('/sync/ledger').set(headers).send(body);
}

async function readLedger(): Promise<WebSyncLedger> {
  const response = await h.api.get('/web/sync/ledger');
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return WebSyncLedgerResponseSchema.parse(response.body);
}

describe('device sync ledger', () => {
  it('stores a device report and reads attention oldest first with every evidence field', async () => {
    const body = report({
      reportedAt: '2026-09-20T10:00:00.000Z',
      lastSyncAt: '2026-09-20T09:59:00.000Z',
      attention: [
        {
          id: 'newer',
          kind: 'field',
          itemId: 'item-1',
          itemName: 'Lamp',
          openedAt: '2026-09-20T10:00:00.000Z',
          problem: 'newer problem',
        },
        {
          id: 'older',
          kind: 'placement',
          itemId: 'item-2',
          itemName: 'Cable',
          openedAt: '2026-09-19T10:00:00.000Z',
          problem: 'older problem',
          mine: { value: 'Shelf', source: 'phone', at: '2026-09-19T09:00:00.000Z' },
          theirs: { value: 'Desk', source: 'web', at: '2026-09-19T09:01:00.000Z' },
          code: { wanted: 'CAB-1', holder: 'item-3', suggested: 'CAB-2' },
          held: {
            title: 'Held fields',
            values: [{ field: 'Length', value: '2 m', fit: 'fits', replacement: 'length-m' }],
          },
          photo: { size: '10 MB', limit: '5 MB' },
          refused: { at: '2026-09-19T10:01:00.000Z', reason: 'still conflicting' },
        },
      ],
      waiting: [
        {
          id: 'waiting-1',
          itemName: 'Book',
          summary: 'Waiting for a dependency',
          since: '2026-09-20T09:00:00.000Z',
          reason: { kind: 'depends', on: 'mutation-1' },
        },
      ],
      resolved: [
        {
          id: 'resolved-1',
          itemName: 'Mug',
          outcome: 'kept mine',
          at: '2026-09-20T08:00:00.000Z',
          dropped: [{ field: 'Colour', value: 'red', fit: 'fits' }],
        },
      ],
    });

    const stored = await postLedger(body);
    expect(stored.status, JSON.stringify(stored.body)).toBe(200);
    expect(stored.body).toEqual({ stored: true });

    const actual = await readLedger();
    expect(actual.devices).toMatchObject([
      {
        id: 'phone-1',
        name: "Joao's iPhone",
        lastSyncAt: body.lastSyncAt,
        reportedAt: body.reportedAt,
        attentionCount: 2,
      },
    ]);
    expect(actual.devices[0]?.receivedAt).toEqual(expect.any(String));
    expect(actual.attention.map((entry) => entry.id)).toEqual(['older', 'newer']);
    expect(actual.attention[0]).toMatchObject({ ...body.attention[1], deviceId: 'phone-1' });
    expect(actual.waiting).toEqual([{ ...body.waiting[0], deviceId: 'phone-1' }]);
    expect(actual.resolved).toEqual([{ ...body.resolved[0], deviceId: 'phone-1' }]);
    expect(actual.attentionCount).toBe(2);
  });

  it('replaces the latest report and ignores an older report', async () => {
    const first = report({
      reportedAt: '2026-09-20T10:00:00.000Z',
      attention: [
        {
          id: 'first',
          kind: 'field',
          itemId: 'item-1',
          itemName: 'Lamp',
          openedAt: '2026-09-20T10:00:00.000Z',
          problem: 'first',
        },
      ],
    });
    const second = report({
      reportedAt: '2026-09-20T11:00:00.000Z',
      attention: [
        {
          id: 'second',
          kind: 'code-collision',
          itemId: 'item-2',
          itemName: 'Cable',
          openedAt: '2026-09-20T11:00:00.000Z',
          problem: 'second',
        },
      ],
    });

    expect((await postLedger(first)).body).toEqual({ stored: true });
    const afterFirst = await readLedger();
    expect((await postLedger(second)).body).toEqual({ stored: true });
    const afterSecond = await readLedger();
    expect(afterSecond.attention.map((entry) => entry.id)).toEqual(['second']);
    expect(afterSecond.receivedHead).not.toBe(afterFirst.receivedHead);

    const older = report({
      reportedAt: '2026-09-20T09:00:00.000Z',
      attention: [
        {
          id: 'older',
          kind: 'field',
          itemId: 'item-3',
          itemName: 'Book',
          openedAt: '2026-09-20T09:00:00.000Z',
          problem: 'should not replace',
        },
      ],
    });
    const ignored = await postLedger(older);
    expect(ignored.status).toBe(200);
    expect(ignored.body).toEqual({ stored: false });
    const afterOlder = await readLedger();
    expect(afterOlder).toEqual(afterSecond);
  });

  it('merges two devices and orders devices newest first while attention is oldest first', async () => {
    const first = report({
      reportedAt: '2026-09-20T10:00:00.000Z',
      attention: [
        {
          id: 'phone-case',
          kind: 'field',
          itemId: 'item-1',
          itemName: 'Lamp',
          openedAt: '2026-09-20T12:00:00.000Z',
          problem: 'phone',
        },
      ],
      waiting: [
        {
          id: 'phone-waiting',
          itemName: 'Book',
          summary: 'phone waiting',
          since: '2026-09-20T10:00:00.000Z',
          reason: { kind: 'catalogue', revision: 4 },
        },
      ],
    });
    const second = report({
      reportedAt: '2026-09-21T10:00:00.000Z',
      attention: [
        {
          id: 'tablet-case',
          kind: 'deleted-elsewhere',
          itemId: 'item-2',
          itemName: 'Cable',
          openedAt: '2026-09-19T10:00:00.000Z',
          problem: 'tablet',
        },
      ],
      waiting: [
        {
          id: 'tablet-waiting',
          itemName: 'Mug',
          summary: 'tablet waiting',
          since: '2026-09-21T10:00:00.000Z',
          reason: { kind: 'behind-case', caseId: 'tablet-case', itemName: 'Cable' },
        },
      ],
    });

    await postLedger(first, 'phone-1', "Joao's iPhone");
    await postLedger(second, 'tablet-1', 'Tablet');

    const actual = await readLedger();
    expect(actual.devices.map((device) => device.id)).toEqual(['tablet-1', 'phone-1']);
    expect(actual.attention.map((entry) => [entry.id, entry.deviceId])).toEqual([
      ['tablet-case', 'tablet-1'],
      ['phone-case', 'phone-1'],
    ]);
    expect(actual.waiting.map((entry) => [entry.id, entry.deviceId])).toEqual([
      ['tablet-waiting', 'tablet-1'],
      ['phone-waiting', 'phone-1'],
    ]);
  });

  it('keeps recent resolved entries and removes entries older than seven days', async () => {
    const now = Date.now();
    const body = report({
      reportedAt: new Date(now).toISOString(),
      resolved: [
        {
          id: 'recent',
          itemName: 'Recent',
          outcome: 'settled',
          at: new Date(now - 6 * DAY_MS).toISOString(),
        },
        {
          id: 'old',
          itemName: 'Old',
          outcome: 'settled',
          at: new Date(now - 8 * DAY_MS).toISOString(),
        },
      ],
    });
    await postLedger(body);

    const actual = await readLedger();
    expect(actual.resolved.map((entry) => entry.id)).toEqual(['recent']);
  });

  it('round-trips unknown kinds, fits and wait reasons', async () => {
    const body = report({
      attention: [
        {
          id: 'future-case',
          kind: 'future-repair-kind',
          itemId: 'item-1',
          itemName: 'Lamp',
          openedAt: '2026-09-20T10:00:00.000Z',
          problem: 'future repair',
          held: {
            title: 'Future held values',
            values: [{ field: 'Future', value: 'value', fit: 'future-fit' }],
          },
        },
      ],
      waiting: [
        {
          id: 'future-wait',
          itemName: 'Cable',
          summary: 'future waiting',
          since: '2026-09-20T10:00:00.000Z',
          reason: { kind: 'future-wait-reason' },
        },
      ],
    });
    await postLedger(body);

    const actual = await readLedger();
    expect(actual.attention[0]).toMatchObject({
      ...body.attention[0],
      deviceId: 'phone-1',
    });
    expect(actual.waiting[0]).toMatchObject({
      ...body.waiting[0],
      deviceId: 'phone-1',
    });
  });

  it('returns an empty all-clear response and advances receivedHead on a later report', async () => {
    const empty = await readLedger();
    expect(empty).toEqual({
      devices: [],
      attention: [],
      waiting: [],
      resolved: [],
      attentionCount: 0,
      receivedHead: null,
    });

    const stored = await postLedger(report({ reportedAt: new Date().toISOString() }));
    expect(stored.body).toEqual({ stored: true });
    const first = await readLedger();
    expect(first.receivedHead).not.toBeNull();

    const ignored = await postLedger(
      report({ reportedAt: '2026-09-19T10:00:00.000Z', attention: [] })
    );
    expect(ignored.body).toEqual({ stored: false });
    expect((await readLedger()).receivedHead).toBe(first.receivedHead);
  });

  it('rejects malformed reports without storing them', async () => {
    const response = await h.api
      .post('/sync/ledger')
      .set(deviceHeaders('phone-1', "Joao's iPhone"))
      .send({ reportedAt: 'not-a-date', lastSyncAt: null, attention: [] });
    expect(response.status).toBe(400);
    expect((await readLedger()).devices).toEqual([]);
  });

  it('requires a device actor and returns the exact refusal body', async () => {
    const body = report();
    const noKey = await postLedger(body, 'phone-1', "Joao's iPhone", PROTOCOL);
    expect(noKey.status).toBe(403);
    expect(noKey.body).toEqual({
      message: 'A ledger report must come from a device',
      code: 'device_actor_required',
    });

    const service = await postLedger(body, 'phone-1', "Joao's iPhone", {
      ...PROTOCOL,
      'x-api-key': SYNC_KEY,
    });
    expect(service.status).toBe(403);
    expect(service.body).toEqual(noKey.body);
    expect((await readLedger()).devices).toEqual([]);
  });

  it('requires the protocol header before accepting a device report', async () => {
    const headers = deviceHeaders('phone-1', "Joao's iPhone");
    delete headers['Pops-Inventory-Protocol'];
    const response = await postLedger(report(), 'phone-1', "Joao's iPhone", headers);
    expect(response.status).toBe(426);
    expect((await readLedger()).devices).toEqual([]);
  });

  it('creates the device ledger table through the fresh migration journal', () => {
    const row = h.db.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'device_sync_ledgers'"
      )
      .get() as { name: string } | undefined;
    expect(row).toEqual({ name: 'device_sync_ledgers' });
  });
});
