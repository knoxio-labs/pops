import { useMemo, useRef } from 'react';

import type { ContactChooserIntent, ContactsHostCapability } from '@pops/pillar-sdk';
import type { ArrangementsWorkspaceProps } from '@pops/trips-workspace';

/** Retain one owner intent per explicit trip/source responsibility operation across dialog remounts. */
export function useArrangementContacts(
  contacts: ContactsHostCapability | undefined,
  tripId: number | undefined
): ArrangementsWorkspaceProps['contactChooserIntent'] {
  const scopes = useRef(new Map<ContactsHostCapability, Map<string, ContactChooserIntent>>());
  return useMemo(() => {
    if (!contacts || tripId === undefined) return undefined;
    return (target): ContactChooserIntent => {
      let intents = scopes.current.get(contacts);
      if (!intents) {
        intents = new Map<string, ContactChooserIntent>();
        scopes.current.set(contacts, intents);
      }
      const key = JSON.stringify([tripId, target.targetKind, target.targetId]);
      const retained = intents.get(key);
      if (retained) return retained;
      const intent = contacts.createIntent();
      intents.set(key, intent);
      return intent;
    };
  }, [contacts, tripId]);
}
