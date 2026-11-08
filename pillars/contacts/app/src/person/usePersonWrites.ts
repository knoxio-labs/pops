import { useRef, useState } from 'react';

import { ContactError } from '../errors';

import type { PersonSnapshot } from './contracts';

/** Serialize explicit person writes and retain uncertainty until a successful read reconciles server state. */
export function usePersonWrites(
  data: PersonSnapshot | undefined,
  blocked: boolean,
  update: (accept: (previous: PersonSnapshot) => PersonSnapshot) => void
) {
  const latch = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [success, setSuccess] = useState(false);
  async function write<T>(
    request: (personId: string) => Promise<T>,
    accept: (previous: PersonSnapshot, receipt: T) => PersonSnapshot
  ) {
    if (latch.current || uncertain || blocked || !data) return false;
    latch.current = true;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const receipt = await request(data.entity.id);
      update((previous) => accept(previous, receipt));
      setSuccess(true);
      return true;
    } catch (failure) {
      const safe =
        failure instanceof ContactError
          ? failure
          : new ContactError('saveFailed', 'contacts.person.write');
      setError(safe);
      setUncertain(
        ['network', 'service', 'invalidResponse', 'saveFailed'].includes(safe.messageKey)
      );
      return false;
    } finally {
      latch.current = false;
      setSaving(false);
    }
  }
  function reset() {
    setUncertain(false);
    setError(null);
    setSuccess(false);
  }
  return {
    saving,
    error,
    uncertain,
    success,
    write,
    reset,
    setError,
    isWriting: () => latch.current,
  };
}
