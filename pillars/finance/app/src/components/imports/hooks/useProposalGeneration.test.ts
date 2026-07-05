import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcessedTransaction } from '../../../store/importStore';

const analyzeMock = vi.hoisted(() => vi.fn());
vi.mock('../../../finance-api/index.js', () => ({
  correctionsAnalyzeCorrection: (...args: unknown[]) => analyzeMock(...args),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { useProposalGeneration } from './useProposalGeneration';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type AnalyzeEnvelope = {
  data: { data: { pattern: string; matchType: 'exact' | 'contains' | 'regex' } | null };
  error: undefined;
};

function analyzeEnvelope(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex' = 'contains'
): AnalyzeEnvelope {
  return { data: { data: { pattern, matchType } }, error: undefined };
}

function makeTransaction(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: 'STARBUCKS STORE 123',
    amount: -8.5,
    account: 'Amex',
    rawRow: '{"checksum":"a"}',
    checksum: 'a',
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProposalGeneration — concurrent accept guard', () => {
  it('opens the window immediately and blocks a second accept while the first proposal is in flight', async () => {
    const deferred = makeDeferred<AnalyzeEnvelope>();
    analyzeMock.mockReturnValueOnce(deferred.promise);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProposalGeneration(), { wrapper });

    const first = makeTransaction({ checksum: 'a', description: 'STARBUCKS STORE 123' });
    const second = makeTransaction({ checksum: 'b', description: 'MCDONALDS 999' });

    act(() => {
      void result.current.generateProposal({
        triggeringTransaction: first,
        entityId: 'ent-starbucks',
        entityName: 'Starbucks',
      });
    });

    // Immediate feedback: the window is open in a loading state before the round-trip resolves.
    expect(result.current.proposalOpen).toBe(true);
    expect(result.current.isGeneratingProposal).toBe(true);
    expect(result.current.proposalSignal).toBeNull();
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));

    // A second accept while the first is in flight is a no-op: no new analysis is kicked off.
    await act(async () => {
      void result.current.generateProposal({
        triggeringTransaction: second,
        entityId: 'ent-mcdonalds',
        entityName: 'McDonalds',
      });
      await Promise.resolve();
    });
    expect(analyzeMock).toHaveBeenCalledTimes(1);

    // Resolve the first proposal; its signal is the one that lands.
    await act(async () => {
      deferred.resolve(analyzeEnvelope('STARBUCKS', 'contains'));
      await deferred.promise;
    });

    await waitFor(() => expect(result.current.isGeneratingProposal).toBe(false));
    expect(result.current.proposalOpen).toBe(true);
    expect(result.current.proposalSignal?.entityName).toBe('Starbucks');
    expect(result.current.proposalSignal?.descriptionPattern).toBe('STARBUCKS');
    expect(result.current.proposalTriggeringTransaction?.description).toBe('STARBUCKS STORE 123');
    // The blocked second accept never overrode the pending window.
    expect(result.current.proposalSignal?.entityName).not.toBe('McDonalds');
  });

  it('re-enables generation after the in-flight proposal resolves', async () => {
    const first = makeDeferred<AnalyzeEnvelope>();
    const later = makeDeferred<AnalyzeEnvelope>();
    analyzeMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(later.promise);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProposalGeneration(), { wrapper });

    act(() => {
      void result.current.generateProposal({
        triggeringTransaction: makeTransaction({ description: 'STARBUCKS STORE 123' }),
        entityId: 'ent-a',
        entityName: 'Starbucks',
      });
    });
    await act(async () => {
      first.resolve(analyzeEnvelope('STARBUCKS'));
      await first.promise;
    });
    await waitFor(() => expect(result.current.isGeneratingProposal).toBe(false));

    // A later accept (after the first settled) is allowed through.
    act(() => {
      void result.current.generateProposal({
        triggeringTransaction: makeTransaction({ checksum: 'c', description: 'MCDONALDS 999' }),
        entityId: 'ent-b',
        entityName: 'McDonalds',
      });
    });
    expect(result.current.isGeneratingProposal).toBe(true);
    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      later.resolve(analyzeEnvelope('MCDONALDS'));
      await later.promise;
    });
    await waitFor(() => expect(result.current.proposalSignal?.entityName).toBe('McDonalds'));
  });

  it('ignores a close request while a proposal is generating, then allows it once settled', async () => {
    const deferred = makeDeferred<AnalyzeEnvelope>();
    analyzeMock.mockReturnValueOnce(deferred.promise);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProposalGeneration(), { wrapper });

    act(() => {
      void result.current.generateProposal({
        triggeringTransaction: makeTransaction({ description: 'STARBUCKS STORE 123' }),
        entityId: 'ent-a',
        entityName: 'Starbucks',
      });
    });
    expect(result.current.proposalOpen).toBe(true);
    expect(result.current.isGeneratingProposal).toBe(true);

    // A close attempt (overlay click / Esc / close button) mid-generation is ignored:
    // the loading window is the only feedback the user has.
    act(() => {
      result.current.handleProposalOpenChange(false);
    });
    expect(result.current.proposalOpen).toBe(true);

    await act(async () => {
      deferred.resolve(analyzeEnvelope('STARBUCKS'));
      await deferred.promise;
    });
    await waitFor(() => expect(result.current.isGeneratingProposal).toBe(false));

    // Once the proposal has resolved, the dialog can be dismissed again.
    act(() => {
      result.current.handleProposalOpenChange(false);
    });
    expect(result.current.proposalOpen).toBe(false);
  });

  it('re-enables generation and surfaces a single fallback when the analysis errors', async () => {
    const deferred = makeDeferred<AnalyzeEnvelope>();
    analyzeMock.mockReturnValueOnce(deferred.promise);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useProposalGeneration(), { wrapper });

    act(() => {
      void result.current.generateProposal({
        triggeringTransaction: makeTransaction({ description: 'STARBUCKS STORE 123' }),
        entityId: 'ent-a',
        entityName: 'Starbucks',
      });
    });
    expect(result.current.isGeneratingProposal).toBe(true);

    await act(async () => {
      deferred.reject(new Error('boom'));
      await deferred.promise.catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isGeneratingProposal).toBe(false));
    // Fallback proposal is surfaced exactly once, and the window stays open.
    expect(toastMock.info).toHaveBeenCalledTimes(1);
    expect(result.current.proposalOpen).toBe(true);
    expect(result.current.proposalSignal?.matchType).toBe('contains');
    expect(analyzeMock).toHaveBeenCalledTimes(1);
  });
});
