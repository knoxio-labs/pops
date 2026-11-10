import { lazy } from 'react';

import type { ContactChooserMountProps, ContactsHostCapability } from '@pops/pillar-sdk';

type Owner = Pick<
  typeof import('@pops/app-contacts'),
  'ContactChooser' | 'ContactChooserSession' | 'readContactReference'
>;

/** Load the public owner UI only when requested; each returned intent retains its own owner session. */
export function createContactsHostCapability(
  loadOwner: () => Promise<Owner> = () => import('@pops/app-contacts')
): ContactsHostCapability {
  return {
    readContactReference: async (uri, options) =>
      (await loadOwner()).readContactReference(uri, options),
    createIntent: () => {
      const Chooser = lazy(async () => {
        const owner = await loadOwner();
        const session = new owner.ContactChooserSession();
        return {
          default: ({ onSelect, ...props }: ContactChooserMountProps) => (
            <owner.ContactChooser
              {...props}
              session={session}
              onSelect={(entity, reference) => onSelect({ name: entity.name, reference })}
            />
          ),
        };
      });
      return { Chooser };
    },
  };
}
