import type { ReactNode } from 'react';

import type { ContactChooserIntent, ContactsHostCapability } from '@pops/pillar-sdk';

import type { Client } from '../trips-api/client';
import type { ArrangementLabels, ArrangementTarget } from './types';

/** Existing translated Handled by controls without standalone navigation, dates or Documents labels. */
export type ResponsibilityLabels = Pick<
  ArrangementLabels,
  | 'handledBy'
  | 'loading'
  | 'self'
  | 'unset'
  | 'clear'
  | 'chooseContact'
  | 'reconcileResponsibility'
  | 'responsibilityUncertain'
  | 'reload'
  | 'contactReference'
  | 'contactMissing'
  | 'contactsUnavailable'
  | 'contactReadError'
  | 'referenceDetails'
>;

/** Canonical responsibility context; Contacts references originate only from the retained owner chooser. */
export interface ArrangementResponsibilityContext {
  tripId: number;
  client?: Client;
  labels: ResponsibilityLabels;
  contacts?: ContactsHostCapability;
  contactChooserIntent?: (target: ArrangementTarget) => ContactChooserIntent;
  /** Advance the exact owner intent only after its known write receipt or explicit reconciliation. */
  advanceContactChooserIntent?: (target: ArrangementTarget, intent: ContactChooserIntent) => void;
}
/** Place this provider above conditional or keyed source fields for the owning host lifetime. */
export interface ArrangementResponsibilityProviderProps {
  identity: Pick<ArrangementResponsibilityContext, 'tripId' | 'client'>;
  children: ReactNode;
}
/** Edit one actual whole Journey, Stay, Event or Rental inside the matching owner provider. */
export interface ArrangementResponsibilityFieldProps {
  identity: ArrangementResponsibilityContext;
  target: ArrangementTarget;
}
