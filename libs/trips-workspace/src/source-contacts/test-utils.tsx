import { vi } from 'vitest';

import { Button } from '@pops/ui';

import type { Mock } from 'vitest';

import type {
  ContactChooserMountProps,
  ContactChooserSelection,
  ContactReferenceReadResult,
  ContactsHostCapability,
} from '@pops/pillar-sdk';

/** Fictional selection issued by the owner seam; consumers must retain its exact opaque URI. */
export const ownerSelection: ContactChooserSelection = {
  name: 'Source organiser',
  reference: { canonicalId: 'canonical-owner-23', uri: 'pops:contacts/contact/canonical-owner-23' },
};
/** Typed owner seam exposes only published chooser and read operations. */
export interface ContactOwnerHarness {
  capability: ContactsHostCapability;
  createIntent: Mock<ContactsHostCapability['createIntent']>;
  readContactReference: Mock<NonNullable<ContactsHostCapability['readContactReference']>>;
  current: () => ContactChooserMountProps;
  reply: (result: ContactReferenceReadResult) => void;
}

/** Public capability seam retains each distinct chooser's last mounted callbacks without owning a Trips record. */
export function contactOwner(): ContactOwnerHarness {
  const mounts: ContactChooserMountProps[] = [];
  const readContactReference = vi.fn<NonNullable<ContactsHostCapability['readContactReference']>>(
    async () => ({ status: 'available', ...ownerSelection, href: '/owner-issued/contact-link' })
  );
  const createIntent = vi.fn<ContactsHostCapability['createIntent']>(() => ({
    Chooser: (props) => {
      mounts.push(props);
      return props.open ? (
        <section aria-label="Owner chooser">
          <Button onClick={() => props.onSelect(ownerSelection)}>Select owner contact</Button>
          <Button onClick={() => props.onOpenChange(false)}>Close owner chooser</Button>
        </section>
      ) : null;
    },
  }));
  return {
    capability: { createIntent, readContactReference } satisfies ContactsHostCapability,
    createIntent,
    readContactReference,
    current: (): ContactChooserMountProps => {
      const current = mounts.at(-1);
      if (!current) throw new Error('Owner chooser is not mounted');
      return current;
    },
    reply: (result: ContactReferenceReadResult): void => {
      readContactReference.mockResolvedValue(result);
    },
  };
}
