import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { arrangementsKey, loadResponsibility, replaceResponsibility } from './api';
import { useResponsibilitySession } from './ResponsibilitySessions';

import type { QueryClient, UseQueryResult } from '@tanstack/react-query';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ResponsibilityOperation, ResponsibilityWrite } from './responsibility-session';
import type {
  ArrangementResponsibility,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';

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
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): ResponsibilityEditor {
  const { queryClient, key, query } = useResponsibilitySource(identity, target);
  const binding = useResponsibilitySession(identity, target);
  const session = binding.session;
  const operation = useSyncExternalStore(session.subscribe, session.read, session.read);
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
    if (write.picker) identity.advanceContactChooserIntent?.(target, write.picker);
    if (!binding.isCurrent()) return;
    queryClient.setQueryData<ArrangementResponsibility>(key, (current) =>
      newerResponsibility(current, confirmed)
    );
    await queryClient.invalidateQueries({
      queryKey: [...arrangementsKey(identity), 'responsibilities'],
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

function useResponsibilitySource(
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): {
  queryClient: QueryClient;
  key: (string | number)[];
  query: UseQueryResult<ArrangementResponsibility, Error>;
} {
  const queryClient = useQueryClient();
  const key = [...arrangementsKey(identity), 'responsibility', target.targetKind, target.targetId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const incoming = await loadResponsibility(identity, target);
      return newerResponsibility(
        queryClient.getQueryData<ArrangementResponsibility>(key),
        incoming
      );
    },
    retry: false,
  });
  return { queryClient, key, query };
}
