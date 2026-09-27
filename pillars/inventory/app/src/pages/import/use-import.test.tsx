import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_BATCH_MAX_ROWS } from '@pops/inventory';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import { useImport } from './use-import.js';

import type { downloadCsv } from '../../foundation/list-page/inventory-csv.js';
import type { commitWithProgress, BatchProgress } from '../../inventory-web/batch-commit.js';
import type {
  BatchCreate,
  BatchDestination,
  BatchRow,
  BatchRun,
} from '../../inventory-web/useBatchCreate.js';
import type { DeleteCreatedResult } from '../../inventory-web/useDeleteCreated.js';

const mocks = vi.hoisted(() => ({
  validate: vi.fn<BatchCreate['validate']>(),
  commit: vi.fn<BatchCreate['commit']>(),
  commitWithProgress: vi.fn<typeof commitWithProgress>(),
  deleteCreated: vi.fn<(ids: readonly string[]) => Promise<DeleteCreatedResult>>(),
  downloadCsv: vi.fn<typeof downloadCsv>(),
}));

vi.mock('../../inventory-web/useBatchCreate.js', () => ({
  useBatchCreate: () => ({ validate: mocks.validate, commit: mocks.commit, isRunning: false }),
}));
vi.mock('../../inventory-web/batch-commit.js', () => ({
  commitWithProgress: mocks.commitWithProgress,
}));
vi.mock('../../inventory-web/useDeleteCreated.js', () => ({
  useDeleteCreated: () => mocks.deleteCreated,
}));
vi.mock('../../foundation/list-page/inventory-csv.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../foundation/list-page/inventory-csv.js')
  >('../../foundation/list-page/inventory-csv.js');
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

function csvFile(text: string, name = 'garage.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = () => {
    throw new Error('Deferred promise was not initialized');
  };
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function validOutcomes(rows: readonly BatchRow[]): BatchRun {
  return { outcomes: rows.map((_, row) => ({ status: 'valid' as const, row })) };
}

function allCreated(rows: readonly BatchRow[]): BatchRun {
  return {
    outcomes: rows.map((_, row) => ({
      status: 'created' as const,
      row,
      itemId: `item-${String(row)}`,
    })),
  };
}

const noDestination: BatchDestination | undefined = undefined;

describe('useImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockImplementation(async (rows) => validOutcomes(rows));
    mocks.commit.mockImplementation(async (rows) => allCreated(rows));
    mocks.commitWithProgress.mockImplementation(
      async (commit, rows, destination, onProgress): Promise<BatchRun> => {
        const run = await commit(rows, destination);
        onProgress({ sent: rows.length, total: rows.length, created: run.outcomes.length });
        return run;
      }
    );
    mocks.deleteCreated.mockResolvedValue({ removed: [], kept: [] });
  });

  it('checks mapped rows through the server dry run and counts ready and skipped', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        { status: 'valid', row: 0 },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'quantity', code: 'invalid', message: 'Quantity is not a number' }],
        },
      ],
    });
    const { result } = renderHook(() => useImport());

    await act(async () => {
      await result.current.load(csvFile('Name,Quantity\r\nLamp,2\r\nMug,two'));
    });
    await act(async () => {
      await result.current.check();
    });

    expect(mocks.validate).toHaveBeenCalledWith([
      { name: 'Lamp', type: '', quantity: '2', code: '', where: '', note: '' },
      { name: 'Mug', type: '', quantity: 'two', code: '', where: '', note: '' },
    ]);
    expect(result.current.phase).toBe('preview');
    expect(result.current.ready).toBe(1);
    expect(result.current.skipped).toBe(1);
    expect(result.current.results[1]?.issues).toEqual([
      { column: 'quantity', message: 'Quantity is not a number' },
    ]);
  });

  it('updates only the selected mapping when headers repeat', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name,Note,Note\r\nLamp,first,second'));
    });
    act(() => result.current.setTarget(2, 'where'));
    await act(async () => {
      await result.current.check();
    });

    expect(mocks.validate).toHaveBeenCalledWith([
      { name: 'Lamp', type: '', quantity: '', code: '', where: 'second', note: 'first' },
    ]);
  });

  it('keeps guessed status tied to the original repeated-header column', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name,Name\r\nLamp,Desk'));
    });

    expect(result.current.guessed).toEqual(new Set(['0:name']));
    act(() => result.current.setTarget(0, 'skip'));
    act(() => result.current.setTarget(1, 'name'));

    expect(result.current.mapping).toEqual([
      { header: 'Name', target: 'skip' },
      { header: 'Name', target: 'name' },
    ]);
    expect(result.current.guessed.has('1:name')).toBe(false);
  });

  it('keeps a newer file load from being overwritten by an older read', async () => {
    const first = csvFile('Name\r\nFirst', 'first.csv');
    const second = csvFile('Name\r\nSecond', 'second.csv');
    const firstText = deferred<string>();
    const secondText = deferred<string>();
    vi.spyOn(first, 'text').mockReturnValue(firstText.promise);
    vi.spyOn(second, 'text').mockReturnValue(secondText.promise);
    const { result } = renderHook(() => useImport());

    let firstLoad: Promise<void> | undefined;
    let secondLoad: Promise<void> | undefined;
    act(() => {
      firstLoad = result.current.load(first);
      secondLoad = result.current.load(second);
    });
    if (secondLoad === undefined || firstLoad === undefined)
      throw new Error('Expected both file loads to start');

    await act(async () => {
      secondText.resolve('Name\r\nSecond');
      await secondLoad;
    });
    expect(result.current.file?.name).toBe('second.csv');

    await act(async () => {
      firstText.resolve('Name\r\nFirst');
      await firstLoad;
    });
    expect(result.current.file?.name).toBe('second.csv');
    expect(result.current.rows[0]).toEqual(['Second']);
  });

  it('commits valid rows and reports invalid rows as skipped', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name\r\nLamp\r\nMug'));
    });
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [
        { status: 'created', row: 0, itemId: 'item-lamp' },
        {
          status: 'invalid',
          row: 1,
          issues: [{ column: 'name', code: 'missing', message: 'Name is required' }],
        },
      ],
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(mocks.commitWithProgress).toHaveBeenCalledWith(
      mocks.commit,
      [
        { name: 'Lamp', type: '', quantity: '', code: '', where: '', note: '' },
        { name: 'Mug', type: '', quantity: '', code: '', where: '', note: '' },
      ],
      noDestination,
      expect.any(Function)
    );
    expect(result.current.phase).toBe('done');
    expect(result.current.imported).toBe(1);
    expect(result.current.skipped).toBe(1);
    expect(result.current.createdIds).toEqual(['item-lamp']);
  });

  it('keeps commit outcomes on parsed rows when an empty-cell row sits between them', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name,Where\r\nLamp,Pantry\r\n,,,,,\r\nMug,Unknown'));
    });
    mocks.commitWithProgress.mockResolvedValue({
      outcomes: [
        { status: 'created', row: 0, itemId: 'item-lamp' },
        { status: 'blank', row: 1 },
        {
          status: 'invalid',
          row: 2,
          issues: [{ column: 'where', code: 'unknown', message: 'Unknown place' }],
        },
      ],
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.results.map((entry) => [entry.row, entry.status])).toEqual([
      [0, 'created'],
      [1, 'blank'],
      [2, 'skipped'],
    ]);
    expect(result.current.results[2]?.issues[0]?.message).toBe('Unknown place');
  });

  it('turns a not-sent row into a problem with no cell column', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        {
          status: 'not-sent',
          row: 0,
          error: new InventoryApiError('The inventory service is unavailable', undefined),
        },
      ],
    });
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name\r\nLamp'));
    });
    await act(async () => {
      await result.current.check();
    });

    expect(result.current.results[0]).toMatchObject({
      status: 'skipped',
      issues: [{ column: null, message: 'The inventory service is unavailable' }],
    });
  });

  it('undoes created ids and resets to upload', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name\r\nLamp'));
    });
    await act(async () => {
      await result.current.commit();
    });
    mocks.deleteCreated.mockResolvedValue({ removed: ['item-0'], kept: ['item-1'] });

    let undoResult: DeleteCreatedResult | undefined;
    await act(async () => {
      undoResult = await result.current.undo();
    });

    expect(mocks.deleteCreated).toHaveBeenCalledWith(['item-0']);
    expect(undoResult).toEqual({ removed: ['item-0'], kept: ['item-1'] });
    expect(result.current.phase).toBe('upload');
    expect(result.current.file).toBeNull();
  });

  it('backs from preview to mapping and from mapping to upload', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name\r\nLamp'));
    });
    await act(async () => {
      await result.current.check();
    });
    act(() => result.current.back());
    expect(result.current.phase).toBe('mapping');
    act(() => result.current.back());
    expect(result.current.phase).toBe('upload');
  });

  it('downloads the skipped rows with the original columns and a Problem column', async () => {
    mocks.validate.mockResolvedValue({
      outcomes: [
        {
          status: 'invalid',
          row: 0,
          issues: [{ column: 'quantity', code: 'invalid', message: 'Quantity is not a number' }],
        },
      ],
    });
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name,Quantity\r\nLamp,two'));
    });
    await act(async () => {
      await result.current.check();
    });

    act(() => result.current.downloadSkipped());

    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'garage-skipped.csv',
      'Name,Quantity,Problem\r\nLamp,two,Quantity is not a number'
    );
  });

  it('starts commit progress at zero until the first slice reports', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.load(csvFile('Name\r\nLamp'));
    });
    let report: ((progress: BatchProgress) => void) | undefined;
    let finish: ((run: BatchRun) => void) | undefined;
    mocks.commitWithProgress.mockImplementation(
      async (_commit, _rows, _destination, onProgress) => {
        report = onProgress;
        return new Promise<BatchRun>((resolve) => {
          finish = resolve;
        });
      }
    );
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.commit();
    });
    expect(result.current.phase).toBe('committing');
    expect(result.current.progress).toBeNull();
    if (report === undefined) throw new Error('progress callback was not captured');
    act(() => report?.({ sent: WEB_BATCH_MAX_ROWS, total: 450, created: 190 }));
    expect(result.current.progress).toEqual({ sent: WEB_BATCH_MAX_ROWS, total: 450, created: 190 });
    await act(async () => {
      finish?.({ outcomes: [] });
      await pending;
    });
  });
});
