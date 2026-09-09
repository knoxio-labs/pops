import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Autocomplete, NumberInput, TextInput } from '@pops/ui';

import { SHOPPING_UNIT_SUGGESTIONS } from './unit-suggestions.js';

const UNIT_SUGGESTIONS = SHOPPING_UNIT_SUGGESTIONS.map((value) => ({ label: value, value }));

/**
 * Shopping add form.
 *
 * Differences vs the generic `ListItemAddForm`:
 *   - `[qty] [unit] [label]` ordering (qty first — most common
 *     starting point).
 *   - Unit field is an `Autocomplete` over the common units, so the
 *     suggestions render the same way on every browser; free-text entry
 *     still works.
 *   - On submit, focus returns to the qty field for fast multi-item
 *     entry.
 */
export interface ShoppingAddFormProps {
  isPending: boolean;
  onAdd: (input: { label: string; qty: number | null; unit: string | null }) => Promise<boolean>;
}

interface FormState {
  qty: string;
  unit: string;
  label: string;
}

const EMPTY_FORM: FormState = { qty: '', unit: '', label: '' };

function parseForm(
  state: FormState
): { qty: number | null; unit: string | null; label: string } | null {
  const label = state.label.trim();
  if (label.length === 0) return null;
  const qty = state.qty.trim().length === 0 ? null : Number(state.qty);
  if (qty !== null && !Number.isFinite(qty)) return null;
  const unit = state.unit.trim().length === 0 ? null : state.unit.trim();
  return { qty, unit, label };
}

function useShoppingAddState(onAdd: ShoppingAddFormProps['onAdd']) {
  const [state, setState] = useState<FormState>(EMPTY_FORM);
  const qtyRef = useRef<HTMLInputElement>(null);
  const submit = async () => {
    const parsed = parseForm(state);
    if (parsed === null) return;
    const ok = await onAdd(parsed);
    if (ok) {
      setState(EMPTY_FORM);
      qtyRef.current?.focus();
    }
  };
  return { state, setState, qtyRef, submit };
}

export function ShoppingAddForm(props: ShoppingAddFormProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const { state, setState, qtyRef, submit } = useShoppingAddState(props.onAdd);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };
  const disabled = props.isPending || state.label.trim().length === 0;
  return (
    // `noValidate`: the kit's NumberInput types `step` as a number, so the qty
    // field can no longer carry `step="any"`, and a decimal quantity would trip
    // the browser's step-mismatch check and silently block submission.
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3"
    >
      <QtyUnitInputs state={state} setState={setState} qtyRef={qtyRef} t={t} />
      <LabelSubmit state={state} setState={setState} disabled={disabled} t={t} />
    </form>
  );
}

function QtyUnitInputs({
  state,
  setState,
  qtyRef,
  t,
}: {
  state: FormState;
  setState: (next: FormState) => void;
  qtyRef: React.RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
}) {
  return (
    <>
      <NumberInput
        ref={qtyRef}
        inputMode="decimal"
        showSteppers={false}
        enableDrag={false}
        value={state.qty}
        onChange={(e) => setState({ ...state, qty: e.target.value })}
        placeholder={t('shopping.add.qty')}
        aria-label={t('shopping.add.qty')}
        containerClassName="w-20"
      />
      <Autocomplete
        suggestions={UNIT_SUGGESTIONS}
        value={state.unit}
        onChange={(unit) => setState({ ...state, unit })}
        placeholder={t('shopping.add.unit')}
        aria-label={t('shopping.add.unit')}
        className="w-32"
      />
    </>
  );
}

function LabelSubmit({
  state,
  setState,
  disabled,
  t,
}: {
  state: FormState;
  setState: (next: FormState) => void;
  disabled: boolean;
  t: (key: string) => string;
}) {
  return (
    <>
      <div className="min-w-32 flex-1">
        <TextInput
          value={state.label}
          onChange={(e) => setState({ ...state, label: e.target.value })}
          placeholder={t('shopping.add.label')}
          aria-label={t('shopping.add.label')}
        />
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {t('shopping.add.submit')}
      </button>
    </>
  );
}
