import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_JOB_LABELS, useLabelJob } from './useLabelJob';

import type { PrintSubject } from '@pops/inventory/labels';

import type { LabelReads } from './label-read-state';

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

describe('label job content dependencies', () => {
  it('blocks only selected dependencies during refresh and failure, then recovers', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const ready = { pending: false, error: null };
    const reads: LabelReads = {
      items: ready,
      catalogue: ready,
      contents: new Map(),
      descendants: new Map([[subject.id, { pending: true, error: null }]]),
    };
    const fragility = new Map([
      [
        subject.id,
        {
          fragile: true,
          recorded: true,
          fields: new Set(['box.Fragile']),
          error: null,
        },
      ],
    ]);
    const { result, rerender } = renderHook(
      (reads: LabelReads) =>
        useLabelJob([subject], {
          sheetId: 'L7169',
          reads,
          fragility,
        }),
      { initialProps: reads }
    );
    expect(result.current.block).toBeNull();
    act(() =>
      result.current.setContent({ kind: 'parts', parts: ['qr', 'code'], fields: ['box.Fragile'] })
    );
    expect(result.current.block).toBe('loading');
    act(() => result.current.print());
    expect(print).not.toHaveBeenCalled();
    const error = new Error('Descendants unavailable');
    rerender({ ...reads, descendants: new Map([[subject.id, { pending: false, error }]]) });
    expect(result.current.block).toBe('read-error');
    expect(result.current.readError).toBe(error);
    act(() => result.current.print());
    expect(print).not.toHaveBeenCalled();
    act(() => result.current.setContent({ kind: 'parts', parts: ['qr', 'code'], fields: [] }));
    expect(result.current.block).toBeNull();
    act(() =>
      result.current.setContent({ kind: 'parts', parts: ['qr', 'code'], fields: ['box.Fragile'] })
    );
    expect(result.current.block).toBe('read-error');
    rerender({ ...reads, descendants: new Map([[subject.id, ready]]) });
    expect(result.current.readError).toBeNull();
    expect(result.current.block).toBeNull();
    act(() => result.current.print());
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});

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
