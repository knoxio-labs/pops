import type { ComponentType } from 'react';

/** Actual owner selection; the canonical reference is never reconstructed from a display label. */
export interface ContactChooserSelection {
  name: string;
  reference: { canonicalId: string; uri: string };
}

/** Controlled view of one owner intent; closing or unmounting must retain its pending outcome. */
export interface ContactChooserMountProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: ContactChooserSelection) => void;
}

/** Opaque owner session: retain this component identity across route views, including ambiguous creation. */
export interface ContactChooserIntent {
  Chooser: ComponentType<ContactChooserMountProps>;
}

/** Host-injected owner UI keeps shared libraries independent of any pillar's implementation. */
export interface ContactsHostCapability {
  createIntent: () => ContactChooserIntent;
}

/** Optional host capabilities forwarded to remote pages; a standalone host may omit them. */
export interface RemotePageHostProps {
  contacts?: ContactsHostCapability;
}
