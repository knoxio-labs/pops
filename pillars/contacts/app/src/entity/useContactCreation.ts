import { useState, useSyncExternalStore } from 'react';

import { ContactChooserSession } from './ContactChooserSession';
import { useEntityCatalogue } from './useEntityCatalogue';

import type { ContactCreationGateway } from './api';

/** Subscribe a chooser view to its owner-controlled intent; optional retained sessions survive route remounts. */
export function useContactCreation(
  gateway: ContactCreationGateway,
  retained?: ContactChooserSession
) {
  const [local] = useState(() => new ContactChooserSession());
  const session = retained ?? local;
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const catalogue = useEntityCatalogue(gateway);
  const type = state.selectedType ?? catalogue.data?.defaultType ?? '';
  return {
    ...state,
    catalogue,
    type,
    setName: session.setName,
    setType: session.setType,
    start: session.start,
    submit: () => {
      if (!state.created && !catalogue.isSuccess) return Promise.resolve(null);
      return session.submit(gateway, type);
    },
  };
}
