import { formContext, formOpenings } from '@/fixtures/inventory/form-openings';
import { FormLoadError, FormSkeleton } from '@/kit/inventory/item-form/form-skeleton';
import { ItemFormPage } from '@/kit/inventory/item-form/item-form-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ComponentType } from 'react';

export const meta: ScreenMeta = { title: 'Item form', order: 12, frame: 'web' };

/**
 * `/inventory/items/new` and `/inventory/items/:id/edit` (iOS parity #7 and
 * #8): only the name is required; a type reveals its fields, every
 * primitive kind in its one and many form; the code is suggested, accepted,
 * typed or refused as taken; a container has no quantity; the destination
 * is the one placement picker; computed fields read as the approved
 * computed-field editor does; photos chosen while creating wait for the
 * item and then upload (POPS-3632); Cancel asks only when something would
 * be lost.
 */
function stateFor(name: string): ComponentType {
  const opening = formOpenings[name];
  if (opening === undefined) throw new Error(`No item form opening named ${name}`);
  return function ItemFormState() {
    return <ItemFormPage opening={opening} context={formContext} />;
  };
}

export const states: ScreenStates = {
  ...Object.fromEntries(Object.keys(formOpenings).map((name) => [name, stateFor(name)])),
  loading: FormSkeleton,
  error: () => <FormLoadError name="Label printer" />,
};

const CreateTyped = stateFor('create-typed');

export default function ItemFormScreen() {
  return <CreateTyped />;
}
