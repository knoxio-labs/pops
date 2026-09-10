/**
 * Target-picker section for the send-to-list modal
 * (pillars/food/docs/prds/send-to-list).
 *
 * Two radio choices, each owning the controls it governs: "Add to existing"
 * wraps a scrollable list of shopping lists, "Create new" wraps a name input
 * prefilled with `Shopping list — YYYY-MM-DD`.
 *
 * Through the kit's `RadioInput` since POPS-3298 gave an option a body slot.
 * Hand-composed primitives were the only way to interleave that content
 * before, which is the shape ADR-051 exists to remove. The body renders
 * whichever option is selected, so a half-typed name survives clicking the
 * other choice and back.
 *
 * The existing radio is disabled when no shopping lists exist; in that case
 * the modal auto-flips to "new" before mounting this component.
 */
import { type ChangeEvent, type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Input, Label, RadioInput } from '@pops/ui';

import { ListChoiceRow } from './ListChoiceRow.js';

import type { FormState } from './types.js';
import type { ShoppingList } from './useSendToListData.js';

interface Props {
  form: FormState;
  setForm: (next: FormState) => void;
  shoppingLists: readonly ShoppingList[];
  alreadySentToListIds: readonly number[];
}

export function SendToListTargetPicker({
  form,
  setForm,
  shoppingLists,
  alreadySentToListIds,
}: Props): ReactElement {
  const { t } = useTranslation('food');
  const hasLists = shoppingLists.length > 0;
  const alreadySentSet = new Set(alreadySentToListIds);
  const groupId = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{t('recipes.detail.sendToList.picker.legend')}</legend>
      <RadioInput
        name={groupId}
        value={form.kind}
        onValueChange={(kind) => setForm({ ...form, kind: kind === 'new' ? 'new' : 'existing' })}
        options={[
          {
            value: 'existing',
            label: t('recipes.detail.sendToList.picker.existing'),
            disabled: !hasLists,
            body: (
              <ExistingBody
                form={form}
                setForm={setForm}
                shoppingLists={shoppingLists}
                alreadySentSet={alreadySentSet}
                hasLists={hasLists}
              />
            ),
          },
          {
            value: 'new',
            label: t('recipes.detail.sendToList.picker.new'),
            body: <NewBody form={form} setForm={setForm} />,
          },
        ]}
      />
    </fieldset>
  );
}

interface ExistingProps {
  form: FormState;
  setForm: (next: FormState) => void;
  shoppingLists: readonly ShoppingList[];
  alreadySentSet: ReadonlySet<number>;
  hasLists: boolean;
}

function ExistingBody({
  form,
  setForm,
  shoppingLists,
  alreadySentSet,
  hasLists,
}: ExistingProps): ReactElement {
  const { t } = useTranslation('food');
  if (!hasLists) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('recipes.detail.sendToList.picker.noLists')}
      </p>
    );
  }
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto">
      {shoppingLists.map((list) => (
        <ListChoiceRow
          key={list.id}
          list={list}
          selected={form.kind === 'existing' && form.listId === list.id}
          wasSentBefore={alreadySentSet.has(list.id)}
          onSelect={() => setForm({ ...form, kind: 'existing', listId: list.id })}
        />
      ))}
    </ul>
  );
}

function NewBody({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div>
      <Label htmlFor="send-to-list-new-name" className="text-xs text-muted-foreground">
        {t('recipes.detail.sendToList.picker.newName')}
      </Label>
      <Input
        id="send-to-list-new-name"
        value={form.newName}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setForm({ ...form, newName: e.target.value })
        }
        disabled={form.kind !== 'new'}
      />
    </div>
  );
}
