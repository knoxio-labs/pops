import { useMemo, useRef } from 'react';

import type { ContactChooserIntent, ContactsHostCapability } from '@pops/pillar-sdk';
import type { ArrangementsWorkspaceProps } from '@pops/trips-workspace';

type RetainedIntent = {
  active: ContactChooserIntent;
  advance: boolean;
  previous: ContactChooserIntent[];
};
type Picker = Pick<
  ArrangementsWorkspaceProps,
  'contactChooserIntent' | 'advanceContactChooserIntent'
>;

/** Retain owner receipts per exact operation; only confirmed or explicitly reconciled writes permit the next picker intent. */
export function useArrangementContacts(
  contacts: ContactsHostCapability | undefined,
  tripId: number | undefined
): Picker {
  const scopes = useRef(new Map<ContactsHostCapability, Map<string, RetainedIntent>>());
  return useMemo(() => {
    if (!contacts || tripId === undefined) return {};
    function entries(): Map<string, RetainedIntent> {
      if (!contacts) throw new Error('Contacts owner capability is required');
      let intents = scopes.current.get(contacts);
      if (!intents) {
        intents = new Map<string, RetainedIntent>();
        scopes.current.set(contacts, intents);
      }
      return intents;
    }
    return {
      contactChooserIntent: (target): ContactChooserIntent => {
        const key = JSON.stringify([tripId, target.targetKind, target.targetId]);
        const intents = entries();
        const retained = intents.get(key);
        if (retained && !retained.advance) return retained.active;
        const intent = contacts.createIntent();
        intents.set(key, {
          active: intent,
          advance: false,
          previous: retained ? [...retained.previous, retained.active] : [],
        });
        return intent;
      },
      advanceContactChooserIntent: (target, intent): void => {
        const retained = entries().get(
          JSON.stringify([tripId, target.targetKind, target.targetId])
        );
        if (retained?.active === intent) retained.advance = true;
      },
    };
  }, [contacts, tripId]);
}
