/**
 * The reference field's picker: search every item and place, the field's
 * allowed targets stated at the top, refused rows kept visible and dimmed
 * with the reason, so nobody wonders why the cabinet they want is missing.
 */
import { Check, MapPin, Search } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, Input, cn } from '@pops/ui';

import { ItemMark } from '../shared/item-mark';
import { referenceOptions, targetsPhrase } from './reference-options';

import type { PlacementWorld } from '../shared/placement-model';
import type { FormFieldDef, ReferenceChoice } from './field-model';
import type { ReferenceOption } from './reference-options';

/** Props for {@link ReferencePickerPanel}. */
export interface ReferencePickerProps {
  field: FormFieldDef;
  world: PlacementWorld;
  chosen: readonly ReferenceChoice[];
  typeLabel: (typeId: string) => string;
  onPick: (choice: ReferenceChoice) => void;
  initialQuery?: string;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function choiceOf(option: ReferenceOption): ReferenceChoice {
  return option.kind === 'item'
    ? { kind: 'item', id: option.item.id, name: option.item.name }
    : { kind: 'location', id: option.location.id, name: option.location.name };
}

function detailOf(option: ReferenceOption): string {
  if (option.refusal !== null) return option.refusal;
  return option.kind === 'item' ? (option.item.typeName ?? 'No type') : 'Place';
}

function OptionRow({
  option,
  picked,
  onPick,
}: {
  option: ReferenceOption;
  picked: boolean;
  onPick: () => void;
}) {
  const refused = option.refusal !== null;
  const choice = choiceOf(option);
  return (
    <li>
      <ButtonPrimitive
        variant="ghost"
        aria-disabled={refused || undefined}
        onClick={refused ? undefined : onPick}
        className={cn(
          'h-10 w-full justify-start gap-2.5 px-2 text-sm font-normal',
          refused && 'cursor-not-allowed opacity-55 hover:bg-transparent'
        )}
      >
        {option.kind === 'item' ? (
          <ItemMark item={option.item} />
        ) : (
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{choice.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{detailOf(option)}</span>
        {picked ? <Check className="size-4 text-app-accent" aria-label="Chosen" /> : null}
      </ButtonPrimitive>
    </li>
  );
}

/** The picker body, drawn in place for review states and inside the popover. */
export function ReferencePickerPanel(props: ReferencePickerProps) {
  const { field, world, chosen, typeLabel, onPick } = props;
  const [query, setQuery] = useState(props.initialQuery ?? '');
  const targets = field.reference ?? { kinds: ['item'], typeIds: [] };
  const options = referenceOptions({ world, targets, query, typeLabel });
  return (
    <div
      role="dialog"
      aria-label={`Choose ${field.label}`}
      className="flex w-96 max-w-full flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="relative border-b p-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          aria-label="Search items and places"
          placeholder="Search items and places"
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 border-0 pl-9 shadow-none focus-visible:ring-0"
        />
      </div>
      <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        {field.label} takes {lowerFirst(targetsPhrase(targets, typeLabel))}.
      </p>
      <ul className="max-h-80 overflow-y-auto p-1" aria-label="Matching items and places">
        {options.map((option) => (
          <OptionRow
            key={`${option.kind}-${choiceOf(option).id}`}
            option={option}
            picked={chosen.some((entry) => entry.id === choiceOf(option).id)}
            onPick={() => onPick(choiceOf(option))}
          />
        ))}
      </ul>
      {options.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Nothing matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
