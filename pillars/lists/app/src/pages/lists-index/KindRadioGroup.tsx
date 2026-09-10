import { useTranslation } from 'react-i18next';

import { cn, RadioGroup, RadioGroupItem } from '@pops/ui';

import { LIST_KINDS, type ListKind } from './list-index-types.js';

import type { ReactElement } from 'react';

interface Props {
  value: ListKind;
  onChange: (next: ListKind) => void;
  /** id prefix so multiple instances on the same page don't collide. */
  idPrefix?: string;
  /** Disable while a mutation is in flight. */
  disabled?: boolean;
}

/**
 * Kind picker for the New / Edit modals.
 *
 * The card's selected and disabled looks are derived from this component's own
 * props rather than from the DOM. They used to be `has-[input:checked]` and
 * `has-[input:disabled]`, which matched nothing: the kit's `RadioGroupItem` is
 * Radix's `Item`, a `<button role="radio" data-state="checked">` and not an
 * `<input>`, so the card never changed border or background and a disabled
 * group never dimmed (POPS-3295). Rewriting the selector against
 * `[data-state=checked]` would work in a browser and remain untestable — jsdom
 * does not evaluate `:has()`, and the class list is identical on every card
 * either way — so the state the component already holds is used directly.
 */
export function KindRadioGroup({
  value,
  onChange,
  idPrefix = 'list-kind',
  disabled = false,
}: Props): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ListKind)}
      aria-label={t('new.fields.kindLabel')}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {LIST_KINDS.map((kind) => {
        const id = `${idPrefix}-${kind}`;
        return (
          <label
            key={kind}
            htmlFor={id}
            className={cn(
              'flex items-center gap-2 rounded-md border p-3 text-sm font-medium hover:bg-accent/40',
              kind === value && 'border-primary bg-accent/60',
              disabled && 'opacity-50'
            )}
          >
            <RadioGroupItem id={id} value={kind} disabled={disabled} />
            <span>{t(`index.kinds.${kind}`)}</span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
