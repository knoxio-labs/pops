/**
 * A reference field in the form: what it points at as chips (a place and
 * an item look different), and one button that opens the picker. A `one`
 * field replaces its target; a `many` field adds to the list.
 */
import { MapPin, Plus, X } from 'lucide-react';

import { Button, ButtonPrimitive, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { ReferencePickerPanel } from './reference-picker';

import type { PlacementWorld } from '../shared/placement-model';
import type { FormFieldDef, ReferenceChoice } from './field-model';

/** Props for {@link ReferenceEditor}. */
export interface ReferenceEditorProps {
  field: FormFieldDef;
  world: PlacementWorld;
  refs: readonly ReferenceChoice[];
  typeLabel: (typeId: string) => string;
  onChange: (refs: readonly ReferenceChoice[]) => void;
  /** Opens the picker on load, for the review state. */
  pickerOpen?: boolean;
  pickerQuery?: string;
}

function RefChip({ choice, onRemove }: { choice: ReferenceChoice; onRemove: () => void }) {
  const Icon = choice.kind === 'location' ? MapPin : INVENTORY_ICONS.item;
  return (
    <li className="flex h-8 max-w-full items-center gap-1.5 rounded-md border bg-muted/50 pl-2 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{choice.name}</span>
      <ButtonPrimitive
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${choice.name}`}
        onClick={onRemove}
        className="text-muted-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </ButtonPrimitive>
    </li>
  );
}

/** A reference field's chips and picker. */
export function ReferenceEditor(props: ReferenceEditorProps) {
  const { field, refs, onChange } = props;
  const many = field.cardinality === 'many';
  const pick = (choice: ReferenceChoice) => {
    if (refs.some((entry) => entry.id === choice.id)) return;
    onChange(many ? [...refs, choice] : [choice]);
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1">
      <ul className="contents" aria-label={`${field.label} targets`}>
        {refs.map((choice) => (
          <RefChip
            key={choice.id}
            choice={choice}
            onRemove={() => onChange(refs.filter((entry) => entry.id !== choice.id))}
          />
        ))}
      </ul>
      <Popover defaultOpen={props.pickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            prefix={<Plus className="size-3.5" aria-hidden />}
            className="text-muted-foreground"
          >
            {refs.length > 0 && !many ? 'Change' : 'Choose'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto border-0 bg-transparent p-0 shadow-none">
          <ReferencePickerPanel
            field={field}
            world={props.world}
            chosen={refs}
            typeLabel={props.typeLabel}
            onPick={pick}
            initialQuery={props.pickerQuery}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
