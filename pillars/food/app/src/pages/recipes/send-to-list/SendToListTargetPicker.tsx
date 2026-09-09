/**
 * Target-picker section for the send-to-list modal
 * (pillars/food/docs/prds/send-to-list).
 *
 * Renders two radio choices: "Add to existing" (a scrollable list of
 * shopping lists with name + item count + last-updated) and "Create
 * new" (text input prefilled with `Shopping list — YYYY-MM-DD`).
 *
 * The existing radio is disabled when no shopping lists exist; in that
 * case the modal auto-flips to "new" before mounting this component.
 */
import { type ChangeEvent, type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Input, Label, RadioGroup, RadioGroupItem } from '@pops/ui';

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
      <RadioGroup
        name={groupId}
        value={form.kind}
        onValueChange={(kind) => setForm({ ...form, kind: kind === 'new' ? 'new' : 'existing' })}
        className="space-y-3"
      >
        <ExistingChoice
          form={form}
          setForm={setForm}
          shoppingLists={shoppingLists}
          alreadySentSet={alreadySentSet}
          hasLists={hasLists}
          optionId={`${groupId}-existing`}
        />
        <NewChoice form={form} setForm={setForm} optionId={`${groupId}-new`} />
      </RadioGroup>
    </fieldset>
  );
}

interface ExistingProps {
  form: FormState;
  setForm: (next: FormState) => void;
  shoppingLists: readonly ShoppingList[];
  alreadySentSet: ReadonlySet<number>;
  hasLists: boolean;
  optionId: string;
}

function ExistingChoice({
  form,
  setForm,
  shoppingLists,
  alreadySentSet,
  hasLists,
  optionId,
}: ExistingProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium">
        <RadioGroupItem value="existing" id={optionId} disabled={!hasLists} />
        <Label htmlFor={optionId} className="cursor-pointer text-sm font-medium">
          {t('recipes.detail.sendToList.picker.existing')}
        </Label>
      </div>
      {hasLists ? (
        <ul className="ml-6 mt-2 max-h-40 space-y-1 overflow-y-auto">
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
      ) : (
        <p className="ml-6 mt-1 text-xs text-muted-foreground">
          {t('recipes.detail.sendToList.picker.noLists')}
        </p>
      )}
    </div>
  );
}

function NewChoice({
  form,
  setForm,
  optionId,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  optionId: string;
}): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium">
        <RadioGroupItem value="new" id={optionId} />
        <Label htmlFor={optionId} className="cursor-pointer text-sm font-medium">
          {t('recipes.detail.sendToList.picker.new')}
        </Label>
      </div>
      <div className="ml-6 mt-2">
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
    </div>
  );
}
