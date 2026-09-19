import { describe, expect, it } from 'vitest';

import { buildInventoryActorHeader } from '../actor-header.js';

describe('buildInventoryActorHeader', () => {
  it('builds the shape inventory.parseActorHeader expects', () => {
    expect(buildInventoryActorHeader('device-1', "Joao's iPhone")).toBe(
      "device:device-1;label=Joao's%20iPhone"
    );
  });

  it('percent-encodes a label containing the field separator', () => {
    const header = buildInventoryActorHeader('device-1', 'Kitchen; iPad');

    expect(header).toBe('device:device-1;label=Kitchen%3B%20iPad');
    // The percent-encoded label must not reintroduce a literal `;` that would
    // let a crafted label be read as a second field by inventory's own
    // `ACTOR_PATTERN`.
    expect(header.split(';')).toHaveLength(2);
  });

  it('percent-encodes a label containing non-ASCII characters', () => {
    expect(buildInventoryActorHeader('device-1', 'Café iPhone')).toBe(
      'device:device-1;label=Caf%C3%A9%20iPhone'
    );
  });
});
