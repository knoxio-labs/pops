import { useReceiptStaging } from '@/kit/purchases/receipts/use-receipt-staging';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useReceiptStaging', () => {
  it('keeps a refusal that arrives before the accepted files of the same gesture', async () => {
    const { result } = renderHook(() => useReceiptStaging());

    act(() => {
      result.current.refuse('till.heic');
      result.current.addFiles([file('frame.jpg', 'image/jpeg')]);
    });
    await flush();

    expect(result.current.staging.parts).toHaveLength(1);
    expect(result.current.staging.problems).toEqual([{ kind: 'rejected', names: ['till.heic'] }]);
  });

  it('gathers every refusal of one gesture into a single complaint', async () => {
    const { result } = renderHook(() => useReceiptStaging());

    act(() => {
      result.current.refuse('one.heic');
      result.current.refuse('two.tiff');
      result.current.addFiles([file('frame.jpg', 'image/jpeg')]);
    });
    await flush();

    expect(result.current.staging.problems).toEqual([
      { kind: 'rejected', names: ['one.heic', 'two.tiff'] },
    ]);
  });

  it('reports a refusal even when the gesture accepted nothing at all', async () => {
    const { result } = renderHook(() => useReceiptStaging());

    act(() => {
      result.current.refuse('till.heic');
    });
    await flush();

    expect(result.current.staging.parts).toHaveLength(0);
    expect(result.current.staging.problems).toEqual([{ kind: 'rejected', names: ['till.heic'] }]);
  });

  it('drops a complaint about a batch the reader has already dealt with', async () => {
    const { result } = renderHook(() => useReceiptStaging());

    act(() => {
      result.current.refuse('till.heic');
      result.current.addFiles([file('frame.jpg', 'image/jpeg')]);
    });
    await flush();
    act(() => {
      result.current.addFiles([file('second.jpg', 'image/jpeg')]);
    });
    await flush();

    expect(result.current.staging.parts).toHaveLength(2);
    expect(result.current.staging.problems).toEqual([]);
  });
});
