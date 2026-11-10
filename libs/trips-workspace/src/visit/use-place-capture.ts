import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ApiError } from '@pops/pillar-sdk/client';

import { createVisitPlace } from './api';

import type { QueryClient } from '@tanstack/react-query';

import type { Place, VisitWorkspaceProps, VisitFieldProps } from './types';

/** Independent place creation receipt; a failed association never retries the creation. */
export interface PlaceCapture {
  name: string;
  setName: (name: string) => void;
  created: Place | undefined;
  busy: boolean;
  failure: unknown;
  uncertain: boolean;
  submit: () => Promise<void>;
  reload: () => void;
  /** Start another capture only after the source confirms this receipt's association. */
  beginNew: (associatedPlaceId: number) => void;
}
type CaptureState = Pick<PlaceCapture, 'name' | 'created' | 'busy' | 'failure' | 'uncertain'>;
type Operation = Pick<CaptureState, 'created' | 'busy' | 'uncertain'>;
interface CaptureStateActions {
  state: CaptureState;
  update: (patch: Partial<CaptureState>) => void;
}
/** Preserve acknowledged place identity and guard ambiguous POST failures from blind retries. */
export function usePlaceCapture(
  identity: VisitWorkspaceProps,
  commit: VisitFieldProps['commit'],
  reload: () => Promise<unknown>
): PlaceCapture {
  const { state, update } = useCaptureState();
  const operation = useRef<Operation>({ busy: false, uncertain: false, created: undefined });
  const cache = useQueryClient();
  const submit = async (): Promise<void> => {
    if (operation.current.busy || operation.current.uncertain) return;
    if (!operation.current.created && !state.name.trim()) return;
    operation.current.busy = true;
    update({ busy: true, failure: undefined });
    try {
      const place = operation.current.created ?? (await createVisitPlace(identity, state.name));
      operation.current.created = place;
      update({ created: place });
      rememberPlace(cache, identity, place);
      await commit({ placeId: place.id });
    } catch (error) {
      update({ failure: error });
      if (!operation.current.created && !explicitRejection(error)) {
        operation.current.uncertain = true;
        update({ uncertain: true });
      }
    } finally {
      operation.current.busy = false;
      update({ busy: false });
    }
  };
  const beginNew = (associatedPlaceId: number): void => {
    if (
      operation.current.busy ||
      operation.current.uncertain ||
      operation.current.created?.id !== associatedPlaceId
    )
      return;
    operation.current.created = undefined;
    update({ created: undefined, name: '', failure: undefined });
  };
  return {
    ...state,
    beginNew,
    submit,
    setName: (name: string): void => update({ name }),
    reload: (): void => {
      void reload().catch((error: unknown) => update({ failure: error }));
    },
  };
}
function useCaptureState(): CaptureStateActions {
  const [state, setState] = useState<CaptureState>({
    name: '',
    created: undefined,
    busy: false,
    failure: undefined,
    uncertain: false,
  });
  const update = (patch: Partial<CaptureState>): void =>
    setState((previous) => ({ ...previous, ...patch }));
  return { state, update };
}
function explicitRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  );
}

function rememberPlace(cache: QueryClient, identity: VisitWorkspaceProps, place: Place): void {
  cache.setQueryData<Place[]>(
    ['trips', identity.client?.getConfig().baseUrl ?? '/trips-api', 'places'],
    (previous) =>
      previous?.some((item) => item.id === place.id) ? previous : [...(previous ?? []), place]
  );
}
