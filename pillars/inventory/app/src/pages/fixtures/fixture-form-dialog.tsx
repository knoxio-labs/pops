import { Dialog } from '@pops/ui';

import { FixtureFormContent } from './fixture-form-body.js';

import type { ReactElement } from 'react';

import type { FixtureFormDialogProps } from './fixture-form-types.js';

export type { FixtureDraft, FixtureFormDialogProps } from './fixture-form-types.js';

/** Renders the validated fixture create/edit form and preserves drafts on failure. */
export function FixtureFormDialog(props: FixtureFormDialogProps): ReactElement {
  const formKey = `${props.fixture?.id ?? 'new'}:${props.open ? 'open' : 'closed'}`;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <FixtureFormContent key={formKey} {...props} /> : null}
    </Dialog>
  );
}
