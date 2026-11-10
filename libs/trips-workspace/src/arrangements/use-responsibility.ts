import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { loadResponsibility, replaceResponsibility } from './api';
import { useResponsibilitySession } from './ResponsibilitySessions';

import type { QueryClient, UseQueryResult } from '@tanstack/react-query';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';
import type { ResponsibilityBinding } from './responsibility-registry';
import type { ResponsibilityOperation, ResponsibilityWrite } from './responsibility-session';
import type { ArrangementResponsibility, ArrangementTarget } from './types';

/** Retained writes use their own response as proof; Contact receipts may contain the producer-verified canonical redirect. */
export interface ResponsibilityEditor {
  query: UseQueryResult<ArrangementResponsibility, Error>;
  busy: boolean;
  failure: Extract<ResponsibilityOperation, { kind: 'uncertain' }> | undefined;
  save: (
    source: ArrangementResponsibility,
    value: ArrangementResponsibility['responsibility'],
    picker?: ContactChooserIntent
  ) => Promise<void>;
  retry: () => Promise<void>;
  reload: () => Promise<void>;
  reconcile: () => Promise<void>;
}
/** Keep per-target operations above conditional views; a GET never settles an unknown PUT by matching fields. */
export function useResponsibility(
  identity: ArrangementResponsibilityContext,
  target: ArrangementTarget
): ResponsibilityEditor {
  const binding = useResponsibilitySession(identity, target);
  const { queryClient, key, query } = useResponsibilitySource(binding);
  const session = binding.session;
  const operation = useSyncExternalStore(session.subscribe, session.read, session.read);
  const advancePicker = identity.advanceContactChooserIntent;
  useEffect(() => {
    if (operation.kind === 'acknowledged' && binding.isCurrent() && advancePicker)
      session.deliverPicker((picker) => advancePicker(binding.target, picker));
  }, [binding, session, operation, advancePicker]);
  async function persist(candidate: ResponsibilityWrite): Promise<void> {
    if (!binding.isCurrent() || !binding.matchesSource(candidate.source)) return;
    const write = session.claim(candidate);
    if (!write) return;
    let confirmed: ArrangementResponsibility;
    try {
      confirmed = await replaceResponsibility(binding.identity, write.source, write.value);
      if (!matchesWrite(write, confirmed))
        throw new Error('Responsibility write receipt does not match its operation');
    } catch (error) {
      session.fail(write, error);
      return;
    }
    if (!session.acknowledge(write, confirmed)) return;
    if (!binding.isCurrent()) return;
    if (advancePicker) session.deliverPicker((picker) => advancePicker(binding.target, picker));
    queryClient.setQueryData<ArrangementResponsibility>(key, (current) =>
      newerResponsibility(current, confirmed)
    );
    await queryClient.invalidateQueries({
      queryKey: [...key.slice(0, 3), 'responsibilities'],
    });
  }
  return {
    query,
    busy: operation.kind === 'saving' || query.isFetching,
    failure: session.failure(),
    save: (source, value, picker): Promise<void> => persist({ source, value, picker }),
    retry: async (): Promise<void> => {
      const current = session.read();
      if (current.kind === 'uncertain') await persist(current.write);
    },
    reload: async (): Promise<void> => {
      if (!binding.isCurrent()) return;
      await query.refetch();
    },
    reconcile: async (): Promise<void> => {
      if (!binding.isCurrent() || session.read().kind !== 'uncertain') return;
      const result = await query.refetch();
      if (!result.isSuccess || !binding.isCurrent()) return;
      const abandoned = session.reconcile();
      if (abandoned?.picker) identity.advanceContactChooserIntent?.(target, abandoned.picker);
    },
  };
}
function matchesWrite(write: ResponsibilityWrite, receipt: ArrangementResponsibility): boolean {
  return (
    receipt.tripId === write.source.tripId &&
    receipt.targetKind === write.source.targetKind &&
    receipt.targetId === write.source.targetId &&
    receipt.revision === write.source.revision + 1 &&
    acceptedResponsibility(receipt.responsibility, write.value)
  );
}

function acceptedResponsibility(
  first: ArrangementResponsibility['responsibility'],
  second: ArrangementResponsibility['responsibility']
): boolean {
  if (second === null) return first === null;
  if (second.kind === 'self') return first?.kind === 'self';
  return first?.kind === 'contact';
}

function newerResponsibility(
  current: ArrangementResponsibility | undefined,
  incoming: ArrangementResponsibility
): ArrangementResponsibility {
  return current && current.revision > incoming.revision ? current : incoming;
}

function useResponsibilitySource(binding: ResponsibilityBinding): {
  queryClient: QueryClient;
  key: readonly (string | number)[];
  query: UseQueryResult<ArrangementResponsibility, Error>;
} {
  const queryClient = useQueryClient();
  const key = binding.queryKey;
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!binding.isCurrent()) throw new Error('Responsibility owner context changed');
      const incoming = await loadResponsibility(binding.identity, binding.target);
      if (!binding.matchesSource(incoming))
        throw new Error('Responsibility source does not match its target');
      return newerResponsibility(
        queryClient.getQueryData<ArrangementResponsibility>(key),
        incoming
      );
    },
    retry: false,
  });
  return { queryClient, key, query };
}
