import {
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@pops/ui';

import { useFieldFormContext } from './FieldFormContext';

import type { FieldKind } from './FieldFormContext';
const fieldKinds = [
  ['short_text', 'Short text'],
  ['long_text', 'Long text'],
  ['integer', 'Integer'],
  ['decimal', 'Decimal'],
  ['boolean', 'Yes / no'],
  ['enum', 'Options'],
  ['measurement', 'Measurement'],
  ['date', 'Date'],
  ['date_time', 'Date and time'],
  ['url', 'URL'],
  ['reference', 'Reference'],
] as const;

function fieldKind(value: string): FieldKind | undefined {
  return fieldKinds.find(([candidate]) => candidate === value)?.[0];
}
interface Props {
  readonly onKeyChange: (value: string) => void;
  readonly onLabelChange: (value: string) => void;
}
/** Renders editable field identity and immutable-after-publication shape controls. */
export function FieldFormIdentity(props: Props) {
  return (
    <>
      <div>
        <h3 className="font-semibold">Field settings</h3>
        <p className="text-sm text-muted-foreground">
          Identity and shape are immutable after publication; labels and presentation remain
          editable.
        </p>
      </div>
      <IdentityInputs {...props} />
    </>
  );
}
function IdentityInputs({ onKeyChange, onLabelChange }: Props) {
  const { help, keyValue, label, setHelp } = useFieldFormContext();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="catalogue-field-label">Field label</Label>
        <Input
          id="catalogue-field-label"
          className="min-h-11"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalogue-field-key">Key</Label>
        <Input
          id="catalogue-field-key"
          className="min-h-11 font-mono"
          value={keyValue}
          disabled={useFieldFormContext().shapeLocked}
          onChange={(event) => onKeyChange(event.target.value)}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="catalogue-field-help">Help text</Label>
        <Textarea
          id="catalogue-field-help"
          value={help}
          onChange={(event) => setHelp(event.target.value)}
        />
      </div>
      <FieldShape />
    </div>
  );
}
function FieldShape() {
  const { cardinality, kind, setCardinality, setKind, shapeLocked, storage } =
    useFieldFormContext();
  const locked = storage === 'computed' || kind === 'boolean';
  return (
    <>
      <div className="space-y-2">
        <Label>Primitive kind</Label>
        <SelectPrimitive
          value={kind}
          onValueChange={(value) => {
            const nextKind = fieldKind(value);
            if (nextKind !== undefined) setKind(nextKind);
          }}
          disabled={shapeLocked}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldKinds.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectPrimitive>
      </div>
      <div className="space-y-2">
        <Label>Cardinality</Label>
        <RadioGroup
          value={locked ? 'one' : cardinality}
          onValueChange={(value) => {
            if (value === 'one' || value === 'many') setCardinality(value);
          }}
          disabled={shapeLocked || locked}
          className="grid grid-cols-2 gap-2"
        >
          <Cardinality value="one" />
          <Cardinality value="many" />
        </RadioGroup>
      </div>
    </>
  );
}
function Cardinality({ value }: { readonly value: 'one' | 'many' }) {
  return (
    <Label
      htmlFor={`cardinality-${value}`}
      className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
    >
      <RadioGroupItem id={`cardinality-${value}`} value={value} />{' '}
      {value === 'one' ? 'One' : 'Many'}
    </Label>
  );
}
