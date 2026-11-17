import { useEffect, useRef, useState } from 'react';

import { createGrantRequests } from './grant-requests.js';
import { isSelectable } from './grant-selection.js';

import type { DevicePermissionsModel, GrantSession } from './types.js';

const CLOSED: GrantSession = {
  target: null,
  open: false,
  phase: 'loading',
  grant: null,
  selection: [],
  failure: null,
  saved: false,
};

/** Owns a disposable grant session with synchronous write/dismiss guards and no background retries. */
export function useDevicePermissions(): DevicePermissionsModel {
  const [state, setState] = useState<GrantSession>(CLOSED);
  const latest = useRef(state);
  const origin = useRef<HTMLButtonElement | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const update = (next: GrantSession) => {
    latest.current = next;
    setState(next);
  };
  const requests = () => createGrantRequests(() => latest.current, update, sequence, busy);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    []
  );
  return {
    ...state,
    origin,
    request(device, button) {
      if (busy.current || device.revokedAt !== null || device.subjectEmail !== null) return;
      origin.current = button;
      update({ ...CLOSED, target: device, open: true });
      void requests().read();
    },
    close() {
      if (busy.current) return;
      sequence.current += 1;
      update({ ...CLOSED, target: latest.current.target });
    },
    toggle(value, checked) {
      const session = latest.current;
      if (
        !session.grant ||
        session.phase !== 'ready' ||
        session.failure ||
        busy.current ||
        !isSelectable(session.grant, value)
      )
        return;
      const selection = session.selection.filter((item) => item !== value);
      update({ ...session, selection: checked ? [...selection, value] : selection, saved: false });
    },
    save: () => {
      void requests().save();
    },
    reload: () => {
      void requests().read();
    },
  };
}
