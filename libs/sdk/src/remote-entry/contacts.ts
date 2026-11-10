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

/**
 * Opaque owner session: retain this component identity across route views, including ambiguous creation.
 * The view may suspend; place local Suspense inside the caller that retains intent and selection guards.
 */
export interface ContactChooserIntent {
  Chooser: ComponentType<ContactChooserMountProps>;
}

/** Caller-controlled cancellation forwarded unchanged to the owner's reference and metadata requests. */
export interface ContactReferenceReadOptions {
  signal?: AbortSignal;
}

/** Owner-verified identity and display facts; metadata failures may retain a separately proven reference. */
export type ContactReferenceReadResult =
  | (ContactChooserSelection & { status: 'available'; href: string })
  | { status: 'missing' }
  | { status: 'unavailable'; reference?: ContactChooserSelection['reference'] }
  | { status: 'readError'; reference?: ContactChooserSelection['reference'] };

/** Host-injected owner UI keeps shared libraries independent of any pillar's implementation. */
export interface ContactsHostCapability {
  createIntent: () => ContactChooserIntent;
  /** Read retained identity through Contacts; abort/timeout returns unavailable, with no hidden timeout or retry. */
  readContactReference?: (
    uri: string,
    options?: ContactReferenceReadOptions
  ) => Promise<ContactReferenceReadResult>;
}

/** Optional host capabilities forwarded to remote pages; a standalone host may omit them. */
export interface RemotePageHostProps {
  contacts?: ContactsHostCapability;
}
