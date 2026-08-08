import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../bfm-api-helpers.js';
import { operatorListDevices, operatorRevokeDevice } from '../../bfm-api/index.js';
import { classifyOperatorFailure, type OperatorFailure } from './operator-failures.js';
import { usePairingCode, type PairingCodeModel } from './usePairingCode.js';

import type { OperatorListDevicesResponses } from '../../bfm-api/types.gen.js';

export type PairedDevice = OperatorListDevicesResponses['200']['devices'][number];

const DEVICES_QUERY_KEY = ['bfm', 'operator', 'devices'] as const;

export type DeviceListState = 'loading' | 'ready' | 'unavailable' | 'refused';

export interface DeviceListModel {
  state: DeviceListState;
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

function useDeviceList(): DeviceListModel {
  const query = useQuery({
    queryKey: DEVICES_QUERY_KEY,
    queryFn: async () => unwrap(await operatorListDevices()),
    retry: false,
  });

  if (query.isPending) return { state: 'loading', devices: [] };
  if (query.error !== null) {
    const failure = classifyOperatorFailure(query.error);
    return { state: failure === 'unavailable' ? 'unavailable' : 'refused', devices: [] };
  }

  return { state: 'ready', devices: query.data.devices };
}

/**
 * Revocation is not reversible and takes effect on the device's next request,
 * so it is gated behind an explicit confirmation of a *named* device rather
 * than a row-level button that fires on click.
 *
 * A failed revoke leaves the dialog open. Closing it on failure would read as
 * "done" for an operation that did not happen — and the device is still
 * trusted until this succeeds.
 */
function useRevocation(): RevocationModel {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<PairedDevice | null>(null);
  const [failure, setFailure] = useState<OperatorFailure | null>(null);

  const mutation = useMutation({
    mutationFn: async (id: string) => unwrap(await operatorRevokeDevice({ path: { id } })),
  });
  const { mutateAsync, reset } = mutation;

  const request = useCallback(
    (device: PairedDevice) => {
      setFailure(null);
      reset();
      setTarget(device);
    },
    [reset]
  );

  const cancel = useCallback(() => {
    setTarget(null);
    setFailure(null);
    reset();
  }, [reset]);

  const confirm = useCallback(() => {
    if (target === null) return;

    setFailure(null);
    void mutateAsync(target.id)
      .then(async () => {
        setTarget(null);
        await queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
      })
      .catch((err: unknown) => setFailure(classifyOperatorFailure(err)));
  }, [mutateAsync, queryClient, target]);

  return { target, isRevoking: mutation.isPending, failure, request, confirm, cancel };
}
