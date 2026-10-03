import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { unwrap } from '../../finance-api-helpers.js';
import { transactionsGet } from '../../finance-api/index.js';

import type { Transaction } from './types';

/** Opens a transaction requested by the transactions page's `transaction` URL parameter. */
export function useDeepLinkedTransaction(onOpen: (transaction: Transaction) => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const transactionId = searchParams.get('transaction');
  const handledId = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['finance', 'transactions', 'detail', transactionId],
    queryFn: async (): Promise<Transaction> => {
      if (transactionId === null) {
        throw new Error('useDeepLinkedTransaction: fetched without a transaction id');
      }
      return unwrap(await transactionsGet({ path: { id: transactionId } })).data;
    },
    enabled: transactionId !== null,
    retry: false,
  });

  useEffect(() => {
    if (transactionId === null) {
      handledId.current = null;
      return;
    }
    if (handledId.current === transactionId) return;

    if (query.isSuccess) {
      handledId.current = transactionId;
      onOpen(query.data);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('transaction');
          return next;
        },
        { replace: true }
      );
    } else if (query.isError) {
      handledId.current = transactionId;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('transaction');
          return next;
        },
        { replace: true }
      );
    }
  }, [onOpen, query.data, query.isError, query.isSuccess, setSearchParams, transactionId]);
}
