import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateEntity } from './use-create-entity';

import type { ProcessedTransaction } from '../../../../store/importStore';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const transaction: ProcessedTransaction = {
  date: '2026-10-01',
  description: 'NEW STORE',
  amount: -10,
  dialectAccountLabel: 'Amex',
  rawRow: '{}',
  checksum: 'creation-row',
  entity: { matchType: 'none' },
  status: 'uncertain',
};

beforeEach(() => vi.clearAllMocks());

describe('creation requires a verified directory', () => {
  it.each([false, true])(
    'handles verified=%s without creating an unchecked duplicate',
    (verified) => {
      const addPendingEntity = vi
        .fn()
        .mockReturnValue({ tempId: 'temp:entity:new', name: 'New Store', type: 'company' });
      const handleEntitySelect = vi.fn();
      const { result } = renderHook(() =>
        useCreateEntity({
          addPendingEntity,
          handleEntitySelect,
          dbEntities: verified ? [] : undefined,
          setLocalTransactions: vi.fn(),
          generateProposal: vi.fn(),
          recomputeForEntity: vi.fn(),
        })
      );
      act(() => result.current.handleCreateEntityWithName(transaction, 'New Store'));
      if (verified) {
        expect(addPendingEntity).toHaveBeenCalledOnce();
        expect(handleEntitySelect).toHaveBeenCalledWith(
          transaction,
          'temp:entity:new',
          'New Store',
          undefined
        );
      } else {
        expect(addPendingEntity).not.toHaveBeenCalled();
        expect(handleEntitySelect).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('identities are unavailable')
        );
      }
    }
  );
});
