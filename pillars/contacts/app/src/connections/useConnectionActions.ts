import { useRef, useState } from 'react';

import { ContactError } from '../errors';

import type { ConnectionDialogOptions, IcloudCredentials } from './contracts';

/** Keep transient credentials outside query caches and serialize deliberate management actions. */
export function useConnectionActions({
  account,
  gateway,
  onClose,
  refresh,
  navigate,
}: ConnectionDialogOptions) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ContactError | null>(null);
  const [runId, setRunId] = useState(account?.latestRunId ?? null);
  async function act(operation: () => Promise<unknown>, close = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await operation();
      await refresh();
      if (close) onClose();
    } catch (failure) {
      setError(
        failure instanceof ContactError
          ? failure
          : new ContactError('service', 'contacts.providers.failed')
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    pending,
    error,
    runId,
    start: () =>
      void act(async () => {
        if (account) setRunId(await gateway.start(account.accountId));
      }),
    disconnect: () =>
      void act(async () => {
        if (account) await gateway.disconnect(account.accountId);
      }, true),
    authorize: (other: boolean) =>
      void act(async () => navigate(await gateway.authorize(account?.accountId, other))),
    connect: (credentials: IcloudCredentials) =>
      void act(() => gateway.connectIcloud(credentials), true),
  };
}
