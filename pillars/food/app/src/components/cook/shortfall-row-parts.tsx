import { useTranslation } from 'react-i18next';

import { Button, NumberInput, RadioInput, type RadioOption } from '@pops/ui';

import { formatQty } from './cook-format.js';

/**
 * Sub-components for `ShortfallRow`: the radio fieldset, the partial-qty
 * editor, and the row header.
 */
import type { ReactNode } from 'react';

import type { LineResolution, LineShortfall } from './cook-resolution-types.js';

type Kind = LineResolution['kind'];

interface ResolutionRadiosProps {
  shortfall: LineShortfall;
  currentKind: Kind | undefined;
  onSelect: (kind: Kind) => void;
}

export function ResolutionRadios(props: ResolutionRadiosProps): ReactNode {
  const { shortfall, currentKind, onSelect } = props;
  const { t } = useTranslation('food');
  const options: RadioOption[] = [
    { value: 'batch-override', label: t('cook.shortfalls.option.batchOverride') },
    { value: 'external', label: t('cook.shortfalls.option.external') },
  ];
  if (shortfall.available > 0) {
    options.push({ value: 'partial', label: t('cook.shortfalls.option.partial') });
  }
  return (
    <RadioInput
      name={`shortfall-${shortfall.lineIndex}`}
      className="gap-1 text-sm"
      value={currentKind ?? ''}
      options={options}
      onValueChange={(next) => onSelect(next as Kind)}
    />
  );
}

interface RowHeaderProps {
  shortfall: LineShortfall;
  unit: string;
}

export function RowHeader(props: RowHeaderProps): ReactNode {
  const { shortfall, unit } = props;
  const { t } = useTranslation('food');
  return (
    <div className="flex justify-between text-sm">
      <span className="font-medium">
        {shortfall.ingredientName}
        {shortfall.variantName === '' ? '' : ` · ${shortfall.variantName}`}
      </span>
      <span className="text-muted-foreground">
        {t('cook.shortfalls.row.needed', { qty: formatQty(shortfall.needed), unit })} ·{' '}
        {t('cook.shortfalls.row.available', { qty: formatQty(shortfall.available), unit })}
      </span>
    </div>
  );
}

interface PartialQtyEditorProps {
  resolution: Extract<LineResolution, { kind: 'partial' }>;
  unit: string;
  onChange: (next: LineResolution) => void;
}

export function PartialQtyEditor(props: PartialQtyEditorProps): ReactNode {
  const { t } = useTranslation('food');
  const { resolution, unit, onChange } = props;
  return (
    <div className="flex gap-2 items-end text-sm">
      <PartialField
        label={`${t('cook.shortfalls.partial.batchQty')}${unit}`}
        testId="partial-batch-qty"
        value={resolution.consumeQty}
        onChange={(n) => onChange({ ...resolution, consumeQty: n })}
      />
      <PartialField
        label={`${t('cook.shortfalls.partial.externalQty')}${unit}`}
        testId="partial-external-qty"
        value={resolution.externalQty}
        onChange={(n) => onChange({ ...resolution, externalQty: n })}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ kind: 'external' })}
      >
        {t('cook.shortfalls.option.external')}
      </Button>
    </div>
  );
}

interface PartialFieldProps {
  label: string;
  testId: string;
  value: number;
  onChange: (next: number) => void;
}

function PartialField(props: PartialFieldProps): ReactNode {
  return (
    <label className="flex flex-col">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <NumberInput
        min={0}
        step={0.01}
        size="sm"
        showSteppers={false}
        centered={false}
        value={props.value}
        // An emptied field has no quantity to commit. Coercing it would send
        // `Number('') === 0` and silently zero the partial, so the last
        // committed quantity stands until a real number is typed.
        onChange={(e) => {
          if (e.target.value === '') return;
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) props.onChange(next);
        }}
        containerClassName="w-24"
        data-testid={props.testId}
      />
    </label>
  );
}
