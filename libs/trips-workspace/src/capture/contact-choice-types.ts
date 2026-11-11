import type { ContactChooserIntent, ContactChooserSelection } from '@pops/pillar-sdk';

/** Finite owning source contexts for Contacts selection; no Trips-owned Person is created. */
export type CaptureContactIntent = {
  kind: 'capture' | 'idea-contact' | 'recommendation';
  id: number;
};

/** Retained owner receipt and link outcome; Idea application requires confirmation of the exact owned write. */
export interface CaptureContactChoice {
  id: string;
  intent: CaptureContactIntent;
  chooser: ContactChooserIntent;
  open: boolean;
  selected: ContactChooserSelection | null;
  applied: boolean;
  linking: boolean;
  linkError: string | null;
}
