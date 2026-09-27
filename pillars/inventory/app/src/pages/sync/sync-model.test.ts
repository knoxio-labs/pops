import { describe, expect, it } from 'vitest';

import {
  archivedCase,
  busyLedger,
  busyLedgerResponse,
  codeCase,
  ipad,
  iphone,
  letGoEntry,
  nowRequiredCase,
  placementCase,
  resolvedEntries,
  typeReplacedCase,
  waitingChanges,
} from '../../foundation/test-fixtures/sync.js';
import {
  casePosition,
  describeValues,
  deviceName,
  isRepairKind,
  parseSyncSegment,
  segmentCounts,
  toSyncLedger,
  valuesThatFit,
  waitText,
} from './sync-model.js';

const DEVICE = "Joao's iPhone";

describe('segmentCounts', () => {
  it('counts each list', () => {
    expect(segmentCounts(busyLedger)).toEqual({ attention: 5, waiting: 4, resolved: 6 });
    expect(segmentCounts({ ...busyLedger, attention: [], waiting: [], resolved: [] })).toEqual({
      attention: 0,
      waiting: 0,
      resolved: 0,
    });
  });
});

describe('casePosition', () => {
  it('has no previous at the start and no next at the end', () => {
    expect(casePosition(busyLedger.attention, 'case-parts-code')).toEqual({
      index: 0,
      total: 5,
      previousId: null,
      nextId: 'case-drill-photo',
    });
    expect(casePosition(busyLedger.attention, 'case-router-placement')?.nextId).toBeNull();
    expect(casePosition(busyLedger.attention, 'case-router-placement')?.previousId).toBe(
      'case-ladder-deleted'
    );
  });

  it('returns null for a case that is not in the list', () => {
    expect(casePosition(busyLedger.attention, 'case-missing')).toBeNull();
    expect(casePosition([], 'case-parts-code')).toBeNull();
  });
});

describe('values', () => {
  it('keeps only values that still fit', () => {
    const values = typeReplacedCase.held?.values ?? [];
    expect(valuesThatFit(values).map((value) => value.field)).toEqual(['Wi-Fi standard', 'Ports']);
  });

  it('describes one, two, or many values', () => {
    expect(describeValues([])).toBe('nothing');
    expect(describeValues([{ field: 'Length', value: '2 m', fit: 'fits' }])).toBe('Length 2 m');
    const three = nowRequiredCase.held?.values ?? [];
    expect(describeValues(three)).toBe('3 values');
    expect(describeValues(three.slice(1))).toBe('Boiler Dual and Pressure 15 bar');
  });
});

describe('deviceName', () => {
  it('names an unknown device literally', () => {
    expect(deviceName(busyLedger.devices, 'dev-iphone')).toBe(DEVICE);
    expect(deviceName(busyLedger.devices, 'dev-gone')).toBe('An unknown device');
  });
});

describe('toSyncLedger', () => {
  it('keeps server order and falls back to reportedAt for a device that never synced', () => {
    const hdmiWaiting = waitingChanges.find((entry) => entry.id === 'wait-hdmi-rename');
    const espressoWaiting = waitingChanges.find((entry) => entry.id === 'wait-espresso');
    const kettle = resolvedEntries.find((entry) => entry.id === 'res-kettle');
    if (hdmiWaiting === undefined || espressoWaiting === undefined || kettle === undefined) {
      throw new Error('sync fixture is incomplete');
    }
    const response = {
      ...busyLedgerResponse,
      devices: [
        {
          id: ipad.id,
          name: ipad.name,
          lastSyncAt: null,
          reportedAt: '2026-09-24T21:14:00Z',
          receivedAt: '2026-09-24T21:14:01Z',
          attentionCount: 0,
        },
        {
          id: iphone.id,
          name: iphone.name,
          lastSyncAt: iphone.lastSyncAt,
          reportedAt: '2026-09-25T10:42:00Z',
          receivedAt: '2026-09-25T10:42:01Z',
          attentionCount: 5,
        },
      ],
      attention: [placementCase, codeCase],
      waiting: [hdmiWaiting, espressoWaiting],
      resolved: [kettle, letGoEntry],
    };

    const ledger = toSyncLedger(response);

    expect(ledger.devices).toEqual([
      {
        id: 'dev-ipad',
        name: "Joao's iPad",
        lastSyncAt: '2026-09-24T21:14:00Z',
      },
      {
        id: 'dev-iphone',
        name: DEVICE,
        lastSyncAt: '2026-09-25T10:41:00Z',
      },
    ]);
    expect(ledger.attention.map((entry) => entry.id)).toEqual([
      'case-router-placement',
      'case-parts-code',
    ]);
    expect(ledger.waiting.map((entry) => entry.id)).toEqual(['wait-hdmi-rename', 'wait-espresso']);
    expect(ledger.resolved.map((entry) => entry.id)).toEqual(['res-kettle', 'res-cable-let-go']);
  });
});

describe('parseSyncSegment', () => {
  it('reads activity and the three lists, anything else as attention', () => {
    expect(parseSyncSegment('activity')).toBe('activity');
    expect(parseSyncSegment('waiting')).toBe('waiting');
    expect(parseSyncSegment('resolved')).toBe('resolved');
    expect(parseSyncSegment(null)).toBe('attention');
    expect(parseSyncSegment('attention')).toBe('attention');
    expect(parseSyncSegment('unknown')).toBe('attention');
  });
});

describe('waitText', () => {
  it('words every reported reason and names the device', () => {
    expect(waitText({ kind: 'depends', on: 'a location' }, DEVICE)).toBe('Sends after a location');
    expect(waitText({ kind: 'catalogue', revision: 13 }, DEVICE)).toBe(
      `Sends once ${DEVICE} downloads catalogue revision 13`
    );
    expect(waitText({ kind: 'catalogue' }, DEVICE)).toBe(
      `Sends once ${DEVICE} downloads the newer fields`
    );
    expect(waitText({ kind: 'app-update' }, DEVICE)).toBe(
      `Sends once ${DEVICE} is updated from the App Store`
    );
    expect(waitText({ kind: 'behind-case', caseId: 'case-1', itemName: 'Router' }, DEVICE)).toBe(
      'Sends after the Router case is decided'
    );
    expect(waitText({ kind: 'behind-case' }, DEVICE)).toBe(
      `Sends after a case on ${DEVICE} is decided`
    );
    expect(waitText({ kind: 'queued' }, DEVICE)).toBe('Waiting to sync');
    expect(waitText({ kind: 'stalled' }, DEVICE)).toBe("Can't be sent");
    expect(waitText({ kind: 'new-reason' }, DEVICE)).toBe(`Held on ${DEVICE}`);
  });
});

describe('isRepairKind', () => {
  it('recognises contract kinds without rejecting a newer unknown kind', () => {
    expect(isRepairKind(codeCase.kind)).toBe(true);
    expect(isRepairKind(archivedCase.kind)).toBe(true);
    expect(isRepairKind('future-kind')).toBe(false);
  });
});
