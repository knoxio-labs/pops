import { describe, expect, it } from 'vitest';

import { formatWhen } from './when';

describe('formatWhen', () => {
  const now = '2026-09-25T10:45:00Z';

  it('says just now, then minutes, then the clock', () => {
    expect(formatWhen('2026-09-25T10:44:30Z', now)).toBe('Just now');
    expect(formatWhen('2026-09-25T10:33:00Z', now)).toBe('12 min ago');
    expect(formatWhen('2026-09-25T09:45:00Z', now)).toBe('09:45');
  });

  it('names yesterday, then the weekday, then the date', () => {
    expect(formatWhen('2026-09-24T18:10:00Z', now)).toBe('Yesterday 18:10');
    expect(formatWhen('2026-09-20T19:45:00Z', now)).toBe('Sun 19:45');
    expect(formatWhen('2026-09-18T08:00:00Z', now)).toBe('18 Sept');
  });

  it('never says minutes for a time after now', () => {
    expect(formatWhen('2026-09-25T10:50:00Z', now)).toBe('10:50');
  });
});
