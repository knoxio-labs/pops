import { describe, expect, it } from 'vitest';

import { measurementDimensionReadout } from './measurement-dimension';

describe('measurementDimensionReadout', () => {
  it('returns null for a blank unit', () => {
    expect(measurementDimensionReadout('')).toBeNull();
    expect(measurementDimensionReadout('   ')).toBeNull();
  });

  it('reads a simple known unit as its base dimension', () => {
    expect(measurementDimensionReadout('kg')).toBe('mass');
    expect(measurementDimensionReadout('cm')).toBe('length');
  });

  it('reads a squared unit with a superscript', () => {
    expect(measurementDimensionReadout('cm²')).toBe('length²');
  });

  it('reads a compound quotient unit', () => {
    expect(measurementDimensionReadout('kg/m³')).toBe('mass·length⁻³');
  });

  it('cancels dimensions that divide out to dimensionless', () => {
    expect(measurementDimensionReadout('cm/m')).toBe('dimensionless');
  });

  it('reads an unrecognised symbol back as itself, not a guessed dimension', () => {
    expect(measurementDimensionReadout('widgets')).toBe('widgets');
  });

  it('reads text outside the unit-term grammar back as itself', () => {
    expect(measurementDimensionReadout('bags of 12')).toBe('bags of 12');
  });
});
