import { describe, expect, it } from 'vitest';

import {
  changedAgo,
  changedAgoLong,
  changedBy,
  changedCount,
  staleChangeLine,
  staleTitle,
  thingsCount,
} from './changed-elsewhere-copy';

import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere';

const now = '2026-09-25T10:45:00Z';

function group(overrides: Partial<WebChangeGroup> = {}): WebChangeGroup {
  return {
    actorId: null,
    actorKind: 'device',
    actorLabel: "Joao's iPhone",
    entityCount: 1,
    eventCount: 1,
    kindCounts: { moved: 1 },
    latestServerTime: '2026-09-25T10:44:00Z',
    ...overrides,
  };
}

describe('changedAgo', () => {
  it('says just now, minutes, hours, then the date', () => {
    expect(changedAgo('2026-09-25T10:44:30Z', now)).toBe('just now');
    expect(changedAgo('2026-09-25T10:33:00Z', now)).toBe('12 min ago');
    expect(changedAgo('2026-09-25T08:45:00Z', now)).toBe('2 h ago');
    expect(changedAgo('2026-09-18T08:00:00Z', now)).toBe('on 18 Sept');
  });
});

describe('changedAgoLong', () => {
  it('says 1 second and 30 seconds', () => {
    expect(changedAgoLong('2026-09-25T10:44:59Z', now)).toBe('1 second ago');
    expect(changedAgoLong('2026-09-25T10:44:30Z', now)).toBe('30 seconds ago');
  });

  it('says 1 minute and 2 minutes', () => {
    expect(changedAgoLong('2026-09-25T10:44:00Z', now)).toBe('1 minute ago');
    expect(changedAgoLong('2026-09-25T10:43:00Z', now)).toBe('2 minutes ago');
  });

  it('says 1 hour and 3 hours, then the date', () => {
    expect(changedAgoLong('2026-09-25T09:45:00Z', now)).toBe('1 hour ago');
    expect(changedAgoLong('2026-09-25T07:45:00Z', now)).toBe('3 hours ago');
    expect(changedAgoLong('2026-09-18T08:00:00Z', now)).toBe('on 18 Sept');
  });

  it('says just now for a time after now', () => {
    expect(changedAgoLong('2026-09-25T10:50:00Z', now)).toBe('just now');
  });
});

describe('changed-elsewhere copy', () => {
  it('names the newest device and how long ago in the long form', () => {
    expect(staleTitle('Places', [group({ latestServerTime: '2026-09-25T10:44:30Z' })], now)).toBe(
      "Places changed on Joao's iPhone 30 seconds ago."
    );
  });

  it('counts several devices', () => {
    expect(
      staleTitle(
        'Places',
        [
          group({ latestServerTime: '2026-09-25T10:44:00Z' }),
          group({ actorLabel: "Joao's iPad", latestServerTime: '2026-09-25T10:43:00Z' }),
        ],
        now
      )
    ).toBe('Places changed on 2 devices 1 minute ago.');
  });

  it('without a subject says changed elsewhere in the short form', () => {
    expect(staleTitle(null, [group({ latestServerTime: '2026-09-25T10:43:00Z' })], now)).toBe(
      'Changed elsewhere 2 min ago.'
    );
  });

  it('names a service change without calling it a device', () => {
    expect(
      staleTitle(
        'Places',
        [
          group({
            actorKind: 'service',
            actorLabel: 'Server',
            latestServerTime: '2026-09-25T10:44:00Z',
          }),
        ],
        now
      )
    ).toBe('Places changed by Server 1 minute ago.');
  });

  it('counts a device and a migration group as 2 sources', () => {
    expect(
      staleTitle(
        'Places',
        [
          group({ latestServerTime: '2026-09-25T10:44:00Z' }),
          group({ actorKind: 'migration', actorLabel: 'Server' }),
        ],
        now
      )
    ).toBe('Places changed by 2 sources 1 minute ago.');
  });

  it('names one group, counts devices, and counts mixed groups as sources', () => {
    const device = group();
    const secondDevice = group({ actorLabel: "Joao's iPad" });
    const migration = group({ actorKind: 'migration', actorLabel: 'Server' });
    expect(changedBy([device])).toBe("Joao's iPhone");
    expect(changedBy([device, secondDevice])).toBe('2 devices');
    expect(changedBy([device, migration])).toBe('2 sources');
  });

  it('says 1 thing, 0 things and 3 things', () => {
    expect(thingsCount(1)).toBe('1 thing');
    expect(thingsCount(0)).toBe('0 things');
    expect(thingsCount(3)).toBe('3 things');
  });

  it('says 1 thing and it for one change, things and them for several', () => {
    expect(staleChangeLine([group({ entityCount: 1 })])).toBe(
      "Joao's iPhone changed 1 thing. Reload to see it"
    );
    expect(staleChangeLine([group({ entityCount: 2 }), group({ entityCount: 1 })])).toBe(
      '2 devices changed 3 things. Reload to see them'
    );
    expect(changedCount([group({ entityCount: 2 }), group({ entityCount: 1 })])).toBe(3);
  });

  it('rejects empty group lists for stale copy lines and titles', () => {
    expect(() => staleChangeLine([])).toThrow();
    expect(() => staleTitle('Places', [], now)).toThrow();
  });
});
