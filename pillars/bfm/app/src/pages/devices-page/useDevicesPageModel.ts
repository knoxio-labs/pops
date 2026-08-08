import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { unwrap } from '../../bfm-api-helpers.js';
import { operatorListDevices, operatorRevokeDevice } from '../../bfm-api/index.js';
import { classifyOperatorFailure, type OperatorFailure } from './operator-failures.js';
import { usePairingCode, type PairingCodeModel } from './usePairingCode.js';

import type { OperatorListDevicesResponses } from '../../bfm-api/types.gen.js';

export type PairedDevice = OperatorListDevicesResponses['200']['devices'][number];

const DEVICES_QUERY_KEY = ['bfm', 'operator', 'devices'] as const;

export type DeviceListState = 'loading' | 'ready' | 'failed';

export interface DeviceListModel {
  state: DeviceListState;
  /** Why the list failed, verbatim from the classifier; `null` unless failed. */
  failure: OperatorFailure | null;
  devices: PairedDevice[];
}

export interface RevocationModel {
  /** The device awaiting confirmation, or `null` when no dialog is open. */
  target: PairedDevice | null;
  isRevoking: boolean;
  failure: OperatorFailure | null;
  request: (device: PairedDevice) => void;
  confirm: () => void;
  cancel: () => void;
}

export interface DevicesPageModel {
  list: DeviceListModel;
  pairing: PairingCodeModel;
  revocation: RevocationModel;
}

export function useDevicesPageModel(): DevicesPageModel {
  return {
    list: useDeviceList(),
    pairing: usePairingCode(),
    revocation: useRevocation(),
  };
}

/**
 * The classifier's verdict is carried through rather than folded down to the
 * two shapes this route can currently produce. Folding it meant a 429 arriving
 * here would have rendered "check your Cloudflare Access session" — advice for
 * a different problem entirely — the day anyone metered the list.
 */
function useDeviceList(): DeviceListModel {
  const query = useQuery({
    queryKey: DEVICES_QUERY_KEY,
    queryFn: async () => unwrap(await operatorListDevices()),
    retry: false,
  });

  if (query.isPending) return { state: 'loading', failure: null, devices: [] };
  if (query.error !== null) {
    return { state: 'failed', failure: classifyOperatorFailure(query.error), devices: [] };
  }

  return { state: 'ready', failure: null, devices: query.data.devices };
}

/**
 * Revocation is not reversible and takes effect on the device's next request,
 * so it is gated behind an explicit confirmation of a *named* device rather
 * than a row-level button that fires on click.
 *
 * A failed revoke leaves the dialog open. Closing it on failure would read as
 * "done" for an operation that did not happen — and the device is still
 * trusted until this succeeds.
 *
 * Cancelling is refused while the request is on the wire, and the refusal
 * lives here rather than in the dialog on purpose. A guard written against the
 * rendered `isRevoking` reads a value from the last commit, so an Escape
 * arriving between the click and React flushing that re-render would still
 * cancel — a window a person cannot hit but a test can, which is how this was
 * found. The ref below is set synchronously inside `confirm`, so there is no
 * window at all.
 */
function useRevocation(): RevocationModel {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<PairedDevice | null>(null);
  const [failure, setFailure] = useState<OperatorFailure | null>(null);
  const isOnTheWire = useRef(false);

  const mutation = useMutation({
    mutationFn: async (id: string) => unwrap(await operatorRevokeDevice({ path: { id } })),
  });
  const { mutateAsync, reset } = mutation;

  const request = useCallback(
    (device: PairedDevice) => {
      if (isOnTheWire.current) return;
      setFailure(null);
      reset();
      setTarget(device);
    },
    [reset]
  );

  const cancel = useCallback(() => {
    if (isOnTheWire.current) return;
    setTarget(null);
    setFailure(null);
    reset();
  }, [reset]);

  const confirm = useCallback(() => {
    if (target === null || isOnTheWire.current) return;

    isOnTheWire.current = true;
    setFailure(null);
    void mutateAsync(target.id)
      .then(async () => {
        setTarget(null);
        await queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
      })
      .catch((err: unknown) => setFailure(classifyOperatorFailure(err)))
      .finally(() => {
        isOnTheWire.current = false;
      });
  }, [mutateAsync, queryClient, target]);

  return { target, isRevoking: mutation.isPending, failure, request, confirm, cancel };
}
