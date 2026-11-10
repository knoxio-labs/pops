import { describe, expect, it } from 'vitest';

import { LegRevisionSchema } from '../../contract/leg-removal-schemas.js';
import { assertLegRevisionWritable } from '../services/leg-revision.js';

describe('leg revision numeric boundary', () => {
  it('admits the last exactly representable successor', () => {
    expect(() => assertLegRevisionWritable(Number.MAX_SAFE_INTEGER - 1)).not.toThrow();
    expect(LegRevisionSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, -1, 0.5, Number.NaN])(
    'rejects a new write at invalid or exhausted revision %s',
    (revision) => {
      expect(() => assertLegRevisionWritable(revision)).toThrow('leg_revision_conflict');
    }
  );

  it('rejects unsafe public revisions while retaining exhausted snapshots for replay reads', () => {
    expect(LegRevisionSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(LegRevisionSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  });
});
