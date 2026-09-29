import { describe, expect, it } from 'vitest';

import { fieldIconFromPresentation, presentationWithIcon } from './field-icon';

describe('field icon presentation', () => {
  it.each([undefined, {}, { icon: null }, { icon: 42 }, { icon: '' }, { icon: {} }])(
    'ignores absent or malformed metadata %j',
    (presentation) => {
      expect(fieldIconFromPresentation(presentation)).toBeUndefined();
    }
  );

  it('preserves icon names for renderers to interpret', () => {
    expect(fieldIconFromPresentation({ icon: 'PackageOpenUp' })).toBe('PackageOpenUp');
    expect(fieldIconFromPresentation({ icon: 'FutureIcon' })).toBe('FutureIcon');
  });

  it('sets and clears only the icon without mutating the original hints', () => {
    const presentation = { highlighted: true, decimalPlaces: 2, icon: 'Weight' };
    expect(presentationWithIcon(presentation, 'PackageOpenUp')).toEqual({
      ...presentation,
      icon: 'PackageOpenUp',
    });
    expect(presentationWithIcon(presentation, '')).toEqual({ highlighted: true, decimalPlaces: 2 });
    expect(presentation.icon).toBe('Weight');
  });
});
