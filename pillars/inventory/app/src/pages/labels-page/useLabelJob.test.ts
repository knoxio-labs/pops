import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_JOB_LABELS, useLabelJob } from './useLabelJob';

import type { PrintSubject } from '@pops/inventory/labels';

const subject: PrintSubject = {
  id: 'grinder',
  name: 'Coffee grinder',
  code: 'KIT-031',
  suggestedCode: null,
  kind: 'item',
  place: null,
  quantity: 1,
};

beforeEach(() => localStorage.clear());

describe('label job size', () => {
  it('allows the maximum and blocks maximum plus one before expanding copies', () => {
    const { result } = renderHook(() => useLabelJob([subject], { sheetId: 'L7159' }));
    act(() => result.current.setCopies('item', MAX_JOB_LABELS));
    expect(result.current.block).toBeNull();
    expect(result.current.labels).toHaveLength(MAX_JOB_LABELS);
    act(() => result.current.setCopies('item', MAX_JOB_LABELS + 1));
    expect(result.current.block).toBe('too-many');
    expect(result.current.labels).toHaveLength(0);
    expect(result.current.pages).toHaveLength(0);
  });

  it('blocks an oversized job after adding subjects and recovers when reduced', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      (subjects: PrintSubject[]) => useLabelJob(subjects, { sheetId: 'L7159' }),
      { initialProps: [subject] }
    );
    act(() => result.current.setCopies('item', 600));
    rerender([subject, { ...subject, id: 'second' }]);
    expect(result.current.block).toBe('too-many');
    expect(result.current.labels).toHaveLength(0);
    act(() => result.current.print());
    expect(print).not.toHaveBeenCalled();
    act(() => result.current.setCopies('item', 36));
    expect(result.current.block).toBeNull();
    expect(result.current.labels).toHaveLength(72);
    expect(result.current.pages).toHaveLength(3);
    print.mockRestore();
  });
});
