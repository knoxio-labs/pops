import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLANK_DRAFT,
  BULK_COLUMNS,
  type BulkColumn,
  type BulkDraft,
} from '../../foundation/list-page/paste-parser.js';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { useBulkEntry, isBlankDraft, toBatchDestination } from './use-bulk-entry.js';

import type {
  BatchCreate,
  BatchRow,
  BatchRowOutcome,
  BatchRun,
} from '../../inventory-web/useBatchCreate.js';

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  commit: vi.fn(),
  commitWithProgress: vi.fn(),
  deleteCreated: vi.fn(),
  useOnline: vi.fn(),
}));

vi.mock('../../inventory-web/useBatchCreate.js', () => ({
  useBatchCreate: () => ({ validate: mocks.validate, commit: mocks.commit, isRunning: false }),
}));
vi.mock('../../inventory-web/batch-commit.js', () => ({
  commitWithProgress: (...args: unknown[]) => mocks.commitWithProgress(...args),
}));
vi.mock('../../inventory-web/useDeleteCreated.js', () => ({
  useDeleteCreated: () => mocks.deleteCreated,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({
  useOnline: () => mocks.useOnline(),
}));

const types = [{ value: 'cable', label: 'Cable' }];

function draft(values: Partial<BulkDraft> = {}): BulkDraft {
  return { ...BLANK_DRAFT, ...values };
}

function run(...outcomes: BatchRowOutcome[]): BatchRun {
  return { outcomes };
}

function valid(row: number): BatchRowOutcome {
  return { status: 'valid', row };
}

function invalid(row: number, message = 'Name is required'): BatchRowOutcome {
  return { status: 'invalid', row, issues: [{ column: 'name', code: 'required', message }] };
}

function entry() {
  return renderHook(() =>
    useBulkEntry({ destination: { kind: 'in-hand' }, defaultTypeKey: null }, types)
  );
}

async function settleValidation(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settlePromise(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.useOnline.mockReturnValue(true);
  mocks.validate.mockResolvedValue(run());
  mocks.commit.mockResolvedValue(run());
  mocks.commitWithProgress.mockImplementation(
    async (
      commit: BatchCreate['commit'],
      rows: readonly BatchRow[],
      destination: Parameters<BatchCreate['commit']>[1],
      onProgress: (progress: { sent: number; total: number; created: number }) => void
    ) => {
      onProgress({ sent: rows.length, total: rows.length, created: rows.length });
      return commit(rows, destination);
    }
  );
  mocks.deleteCreated.mockResolvedValue({ removed: [], kept: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isBlankDraft', () => {
  it('is true only when every cell trims to empty', () => {
    expect(isBlankDraft(BLANK_DRAFT)).toBe(true);
    expect(isBlankDraft(draft({ name: '  ', note: '\t' }))).toBe(true);
    expect(isBlankDraft(draft({ note: 'kept' }))).toBe(false);
    expect(isBlankDraft(draft({ quantity: '0' }))).toBe(false);
  });
});

describe('toBatchDestination', () => {
  it('maps in hand, a place and a container to the wire form', () => {
    expect(toBatchDestination({ kind: 'in-hand' })).toEqual({ kind: 'hand' });
    expect(toBatchDestination({ kind: 'location', locationId: 'kitchen' })).toEqual({
      kind: 'location',
      locationId: 'kitchen',
    });
    expect(toBatchDestination({ kind: 'container', containerId: 'box' })).toEqual({
      kind: 'container',
      itemId: 'box',
    });
  });
});

describe('useBulkEntry', () => {
  it('checks 200ms after the last edit and marks rows ready or refused with server issues', async () => {
    mocks.validate.mockResolvedValue(run(valid(0), invalid(1, 'Duplicate code')));
    const { result } = entry();

    act(() => {
      result.current.setCell(0, 'name', 'Drill');
      result.current.setCell(1, 'name', 'Saw');
    });
    expect(mocks.validate).not.toHaveBeenCalled();
    await settleValidation();

    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(result.current.rows[0]?.status).toBe('ready');
    expect(result.current.rows[1]?.status).toBe('refused');
    expect(result.current.rows[1]?.issues).toEqual([
      { column: 'name', code: 'required', message: 'Duplicate code' },
    ]);
    expect(result.current.phase).toBe('has-errors');
  });

  it('a check that fails in transport leaves rows unchecked and sets the error', async () => {
    const error = new InventoryApiError('offline', undefined);
    mocks.validate
      .mockResolvedValueOnce(run({ status: 'not-sent', row: 0, error }))
      .mockResolvedValueOnce(run(valid(0)));
    const { result } = entry();

    act(() => result.current.setCell(0, 'name', 'Drill'));
    await settleValidation();
    expect(result.current.error).toBe(error);
    expect(result.current.rows[0]?.status).toBe('unchecked');
    expect(result.current.rows[0]?.issues).toEqual([]);

    act(() => result.current.setCell(0, 'name', 'Drill 2'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('a paste checks at once and names ignored header columns', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = entry();

    let takenOver = false;
    act(() => {
      takenOver = result.current.paste('Name,Colour,Qty\nMugs,blue,3', 0);
    });
    await settlePromise();
    expect(takenOver).toBe(true);
    expect(result.current.rows[0]?.status).toBe('ready');
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(result.current.rows[0]?.draft).toEqual({
      ...BLANK_DRAFT,
      name: 'Mugs',
      quantity: '3',
    });
    expect(result.current.pasteNote).toBe(
      'Read a header row. The Colour column is not an item field and was left out.'
    );
  });

  it('leaves a single-cell paste to the input', () => {
    const { result } = entry();
    act(() => result.current.setCell(0, 'name', 'Existing'));
    const before = result.current.rows[0]?.draft;

    let takenOver = true;
    act(() => {
      takenOver = result.current.paste('Garage', 0);
    });

    expect(takenOver).toBe(false);
    expect(result.current.rows[0]?.draft).toEqual(before);
  });

  it('leaves a single cell copied with a trailing line break to the input', async () => {
    const { result } = entry();
    act(() => {
      ['Name', 'Cable', '1', 'C-1', 'Kitchen', 'keep'].forEach((value, index) => {
        const column: BulkColumn | undefined = BULK_COLUMNS[index];
        if (column === undefined) throw new Error('test column missing');
        result.current.setCell(2, column, value);
      });
    });
    const before = result.current.rows[2]?.draft;

    let copiedCellTakenOver = true;
    let copiedCellWithLfTakenOver = true;
    let tableTakenOver = false;
    await act(async () => {
      copiedCellTakenOver = result.current.paste('Garage\r\n', 2);
      copiedCellWithLfTakenOver = result.current.paste('Garage\n', 2);
      tableTakenOver = result.current.paste('a\tb\n', 2);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(copiedCellTakenOver).toBe(false);
    expect(copiedCellWithLfTakenOver).toBe(false);
    expect(tableTakenOver).toBe(true);
    expect(before).toEqual({
      name: 'Name',
      type: 'Cable',
      quantity: '1',
      code: 'C-1',
      where: 'Kitchen',
      note: 'keep',
    });
  });

  it('changing the default type or destination rechecks immediately and ignores equal values', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = entry();
    act(() => result.current.setCell(0, 'name', 'Drill'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('ready');
    mocks.validate.mockClear();

    act(() => result.current.setDefaultTypeKey('cable'));
    await settlePromise();
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ name: 'Drill', type: 'Cable' }),
    ]);
    mocks.validate.mockClear();

    act(() => result.current.setDestination({ kind: 'container', containerId: 'box' }));
    await settlePromise();
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0]?.[1]).toEqual({ kind: 'container', itemId: 'box' });
    act(() => {
      result.current.setDefaultTypeKey('cable');
      result.current.setDestination({ kind: 'container', containerId: 'box' });
    });
    expect(mocks.validate).toHaveBeenCalledOnce();
  });

  it('drops an older check answer after a newer edit', async () => {
    let resolveFirst: ((value: BatchRun) => void) | undefined;
    const first = new Promise<BatchRun>((resolve) => {
      resolveFirst = resolve;
    });
    mocks.validate.mockImplementation((rows: readonly BatchRow[]) =>
      rows[0]?.name === 'first' ? first : Promise.resolve(run(valid(0)))
    );
    const { result } = entry();

    act(() => result.current.setCell(0, 'name', 'first'));
    await settleValidation();
    act(() => result.current.setCell(0, 'name', 'second'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('ready');
    resolveFirst?.(run(invalid(0, 'old answer')));
    await act(async () => {
      await first;
    });
    expect(result.current.rows[0]?.draft.name).toBe('second');
    expect(result.current.rows[0]?.status).toBe('ready');
  });

  it('drops an in-flight check answer when the page goes offline', async () => {
    let resolveValidation: ((value: BatchRun) => void) | undefined;
    const pending = new Promise<BatchRun>((resolve) => {
      resolveValidation = resolve;
    });
    mocks.validate.mockReturnValue(pending);
    const { result, rerender } = entry();

    act(() => result.current.setCell(0, 'name', 'Drill'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('unchecked');

    mocks.useOnline.mockReturnValue(false);
    rerender();
    resolveValidation?.(run(invalid(0, 'stale answer')));
    await act(async () => {
      await pending;
    });

    expect(result.current.rows[0]?.status).toBe('unchecked');
    expect(result.current.error).toBeNull();
  });

  it('sends a blank Type as the default type label and never as the key', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = renderHook(() =>
      useBulkEntry({ destination: { kind: 'in-hand' }, defaultTypeKey: 'cable' }, types)
    );
    act(() => result.current.setCell(0, 'name', 'Drill'));
    await settleValidation();
    expect(mocks.validate.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ type: 'Cable' })]);
  });

  it('sends an unknown default type as an empty Type', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = renderHook(() =>
      useBulkEntry({ destination: { kind: 'in-hand' }, defaultTypeKey: 'missing' }, types)
    );
    act(() => result.current.setCell(0, 'name', 'Drill'));
    await settleValidation();
    expect(mocks.validate.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ type: '' })]);
  });

  it('sends a container destination in the wire form', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = entry();
    act(() => {
      result.current.setCell(0, 'name', 'Drill');
      result.current.setDestination({ kind: 'container', containerId: 'box' });
    });
    await settlePromise();
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.validate.mock.calls[0]?.[1]).toEqual({ kind: 'container', itemId: 'box' });
  });

  it('sends rows through the last non-blank row and not the spare rows', async () => {
    mocks.validate.mockImplementation((rows: readonly BatchRow[]) =>
      Promise.resolve(run(...rows.map((_, row) => valid(row))))
    );
    const { result } = entry();
    act(() => {
      result.current.setCell(0, 'name', 'First');
      result.current.setCell(1, 'name', '   ');
      result.current.setCell(2, 'name', 'Third');
    });
    await settleValidation();
    expect(mocks.validate.mock.calls[0]?.[0]).toHaveLength(3);
    expect(result.current.rows).toHaveLength(6);
  });

  it('creates ready rows, keeps invalid rows, and preserves their text', async () => {
    mocks.validate.mockResolvedValue(run(valid(0), invalid(1, 'Duplicate')));
    const { result } = entry();
    act(() => {
      result.current.setCell(0, 'name', 'A');
      result.current.setCell(1, 'name', 'B');
    });
    await settleValidation();
    expect(result.current.counts.ready).toBe(1);

    mocks.commitWithProgress.mockResolvedValue(
      run({ status: 'created', row: 0, itemId: 'item-a' }, invalid(1, 'Still duplicate'))
    );
    await act(async () => {
      await result.current.create();
    });

    expect(result.current.createdIds).toEqual(['item-a']);
    expect(result.current.phase).toBe('partial-created');
    expect(result.current.rows[0]?.draft.name).toBe('B');
    expect(result.current.rows[0]?.issues).toEqual([
      { column: 'name', code: 'required', message: 'Still duplicate' },
    ]);
    expect(result.current.rows).toHaveLength(4);
  });

  it('keeps a not-sent row unchanged on Create and sets the error', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = entry();
    act(() => result.current.setCell(0, 'name', 'A'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('ready');
    const error = new InventoryApiError('create failed', undefined);
    mocks.commitWithProgress.mockResolvedValue(run({ status: 'not-sent', row: 0, error }));

    await act(async () => {
      await result.current.create();
    });

    expect(result.current.rows[0]?.draft.name).toBe('A');
    expect(result.current.rows[0]?.status).toBe('ready');
    expect(result.current.error).toBe(error);
  });

  it('undoes the ids created by the last Create', async () => {
    mocks.validate.mockResolvedValue(run(valid(0)));
    const { result } = entry();
    act(() => result.current.setCell(0, 'name', 'A'));
    await settleValidation();
    expect(result.current.rows[0]?.status).toBe('ready');
    mocks.commitWithProgress.mockResolvedValue(
      run({ status: 'created', row: 0, itemId: 'item-a' })
    );
    await act(async () => result.current.create());
    mocks.deleteCreated.mockResolvedValue({ removed: ['item-a'], kept: [] });

    await act(async () => {
      await result.current.undoCreated();
    });

    expect(mocks.deleteCreated).toHaveBeenCalledWith(['item-a']);
    expect(result.current.createdIds).toEqual([]);
    expect(result.current.phase).toBe('editing');
  });

  it('always keeps three blank rows under the last typed row', () => {
    const { result } = entry();
    act(() => result.current.setCell(2, 'name', 'Third'));
    expect(result.current.rows).toHaveLength(6);
    act(() => result.current.setCell(2, 'name', ''));
    expect(result.current.rows).toHaveLength(3);
    act(() => result.current.setCell(5, 'name', 'Sixth'));
    expect(result.current.rows).toHaveLength(9);
  });
});
