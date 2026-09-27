import { Dialog } from '@pops/ui';

import { FixtureFormContent } from './fixture-form-body.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { FixtureKind } from './fixture-kinds.js';
import type { FixtureDetail, FixtureListRow } from './fixture-model.js';

/** The validated form draft before its kind is mapped to the API's type field. */
export interface FixtureDraft {
  readonly name: string;
  readonly kind: FixtureKind | null;
  readonly locationId: string;
  readonly notes: string | null;
}

/** Props for the new and edit fixture dialog. */
export interface FixtureFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locations: readonly LocationModel[];
  readonly locationsStatus?: 'pending' | 'error' | 'success';
  readonly onRetryLocations?: () => void;
  readonly fixture?: FixtureListRow | FixtureDetail;
  readonly disabledReason?: string;
  readonly onSave: (draft: FixtureDraft) => Promise<FixtureDetail>;
}

/** Renders the validated fixture create/edit form and preserves drafts on failure. */
export function FixtureFormDialog(props: FixtureFormDialogProps): ReactElement {
  const formKey = `${props.fixture?.id ?? 'new'}:${props.open ? 'open' : 'closed'}`;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <FixtureFormContent key={formKey} {...props} /> : null}
    </Dialog>
  );
}
