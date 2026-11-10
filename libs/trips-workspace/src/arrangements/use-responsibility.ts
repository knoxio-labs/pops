import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { arrangementsKey, loadResponsibility, replaceResponsibility } from './api';

import type { UseQueryResult } from '@tanstack/react-query';

import type {
  ArrangementResponsibility,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';

type Failure = {
  error: unknown;
  source: ArrangementResponsibility;
  value: ArrangementResponsibility['responsibility'];
};
/** Independent revisioned responsibility editor; uncertain retries keep their original target, revision and intent. */
export interface ResponsibilityEditor {
  query: UseQueryResult<ArrangementResponsibility, Error>;
  busy: boolean;
  failure: Failure | undefined;
  save: (
    source: ArrangementResponsibility,
    value: ArrangementResponsibility['responsibility']
  ) => Promise<void>;
  reload: () => Promise<void>;
}
/** Load and replace only explicit responsibility without validating or changing any Contact source. */
export function useResponsibility(
  identity: ArrangementsWorkspaceProps,
  target: ArrangementTarget
): ResponsibilityEditor {
  const queryClient = useQueryClient();
  const key = [...arrangementsKey(identity), 'responsibility', target.targetKind, target.targetId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => loadResponsibility(identity, target),
    retry: false,
  });
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  async function save(
    source: ArrangementResponsibility,
    value: ArrangementResponsibility['responsibility']
  ): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const confirmed = await replaceResponsibility(identity, source, value);
      queryClient.setQueryData(key, confirmed);
      await queryClient.invalidateQueries({
        queryKey: [...arrangementsKey(identity), 'responsibilities'],
      });
      setFailure(undefined);
    } catch (error) {
      setFailure({ error, source, value });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return {
    query,
    busy,
    failure,
    save,
    reload: async (): Promise<void> => {
      const result = await query.refetch();
      if (result.isSuccess) setFailure(undefined);
    },
  };
}
