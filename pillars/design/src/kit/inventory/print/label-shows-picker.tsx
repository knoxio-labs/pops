/**
 * "Label shows": the one control for what goes on every label of the job.
 * It replaces the Auto / Box / Item template tabs, whose three choices are
 * its first three presets. The button names the choice; the popover holds
 * the presets on the left and the parts they are made of on the right, so
 * a preset is a shortcut to a set of ticks and any other mix is one tick
 * away. Fields come from the types of the items in the job.
 */
import { Check, ChevronDown } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@pops/ui';

import {
  describeContent,
  LABEL_PRESETS,
  matchingPreset,
  tickedParts,
  toggleField,
  togglePart,
} from './label-content';
import { OptionField } from './print-option-field';

import type { LabelContent, LabelFieldChoice, LabelPart } from './label-content';

/** Props for {@link LabelShowsPicker}. */
export interface LabelShowsPickerProps {
  content: LabelContent;
  fields: readonly LabelFieldChoice[];
  onChange: (content: LabelContent) => void;
  /** Opens with the popover showing, for review. */
  defaultOpen?: boolean;
}

const PART_CHIPS: readonly { part: LabelPart; label: string }[] = [
  { part: 'qr', label: 'QR code' },
  { part: 'name', label: 'Name' },
  { part: 'code', label: 'Code' },
  { part: 'contents', label: 'Contents' },
];

function Presets({ content, onChange }: Pick<LabelShowsPickerProps, 'content' | 'onChange'>) {
  const current = matchingPreset(content)?.id;
  return (
    <div className="flex min-w-0 flex-col gap-1" role="group" aria-label="Presets">
      <p className="px-2 text-xs font-medium text-muted-foreground">Presets</p>
      {LABEL_PRESETS.map((preset) => {
        const active = preset.id === current;
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(preset.content)}
            className={cn(
              'flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-app-accent',
              active ? 'bg-app-accent/15' : 'hover:bg-muted'
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{preset.label}</span>
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-app-accent" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Chip({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-app-accent',
        on ? 'border-app-accent/60 bg-app-accent/15 font-medium' : 'hover:bg-muted'
      )}
    >
      {on ? <Check className="size-3.5 text-app-accent" aria-hidden /> : null}
      {label}
    </button>
  );
}

function groupByType(fields: readonly LabelFieldChoice[]): [string, LabelFieldChoice[]][] {
  const groups = new Map<string, LabelFieldChoice[]>();
  for (const field of fields) {
    groups.set(field.typeName, [...(groups.get(field.typeName) ?? []), field]);
  }
  return [...groups.entries()];
}

function Parts({ content, fields, onChange }: LabelShowsPickerProps) {
  const ticked = tickedParts(content);
  const chosenFields = content.kind === 'auto' ? [] : content.fields;
  return (
    <div className="flex min-w-0 flex-col gap-3 border-l pl-4" role="group" aria-label="Parts">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">On every label</p>
        <div className="flex flex-wrap gap-1.5">
          {PART_CHIPS.map((chip) => (
            <Chip
              key={chip.part}
              label={chip.label}
              on={ticked.includes(chip.part)}
              onChange={(on) => onChange(togglePart(content, chip.part, on))}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {content.kind === 'auto'
            ? 'Auto also adds the name on boxes.'
            : 'Contents print on boxes only.'}
        </p>
      </div>
      <div className="flex min-h-0 flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Fields</p>
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None of these items has a type with fields.
          </p>
        ) : (
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {groupByType(fields).map(([typeName, group]) => (
              <div key={typeName} className="space-y-1" role="group" aria-label={typeName}>
                <p className="text-xs text-muted-foreground">{typeName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.map((field) => (
                    <Chip
                      key={field.id}
                      label={field.label}
                      on={chosenFields.includes(field.id)}
                      onChange={(on) => onChange(toggleField(content, field.id, on))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function focusActive(event: Event) {
  const scope = event.currentTarget;
  if (!(scope instanceof HTMLElement)) return;
  const active = scope.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (active === null) return;
  event.preventDefault();
  active.focus({ preventScroll: true });
}

/** The "Label shows" button and its popover. */
export function LabelShowsPicker(props: LabelShowsPickerProps) {
  const summary = describeContent(props.content);
  return (
    <OptionField label="Label shows">
      <Popover defaultOpen={props.defaultOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-64 justify-between font-normal"
            aria-label={`Label shows: ${summary}`}
            suffix={<ChevronDown className="size-4 text-muted-foreground" aria-hidden />}
          >
            <span className="truncate">{summary}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="grid w-[34rem] grid-cols-2 gap-4"
          onOpenAutoFocus={focusActive}
        >
          <Presets content={props.content} onChange={props.onChange} />
          <Parts {...props} />
        </PopoverContent>
      </Popover>
    </OptionField>
  );
}
