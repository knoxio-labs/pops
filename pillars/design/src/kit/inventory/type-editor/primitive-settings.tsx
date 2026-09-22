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
  Switch,
  Textarea,
} from '@pops/ui';

function FieldIdentity() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="field-label">Field label</Label>
          <Input id="field-label" defaultValue="Connectors" className="min-h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="field-key">Key</Label>
          <Input id="field-key" defaultValue="connectors" className="min-h-11 font-mono" disabled />
          <p className="text-xs text-muted-foreground">The key cannot change after publication.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="field-help">Help text</Label>
        <Textarea
          id="field-help"
          defaultValue="Physical data and power connectors available on this item."
        />
      </div>
    </>
  );
}

function FieldShape() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Primitive kind</Label>
        <SelectPrimitive defaultValue="enum">
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="integer">Integer</SelectItem>
            <SelectItem value="decimal">Decimal</SelectItem>
            <SelectItem value="boolean">Yes / no</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="enum">Options</SelectItem>
            <SelectItem value="measurement">Measurement</SelectItem>
            <SelectItem value="reference">Reference</SelectItem>
          </SelectContent>
        </SelectPrimitive>
      </div>
      <div className="space-y-2">
        <Label>Cardinality</Label>
        <RadioGroup defaultValue="many" className="grid grid-cols-2 gap-2">
          <Label
            htmlFor="one"
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id="one" value="one" /> One
          </Label>
          <Label
            htmlFor="many"
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id="many" value="many" /> Many
          </Label>
        </RadioGroup>
      </div>
    </div>
  );
}

/** Labelled field setting with its product impact stated beside the switch. */
export function FieldToggle({
  id,
  label,
  detail,
  checked,
}: {
  id: string;
  label: string;
  detail: string;
  checked?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch id={id} defaultChecked={checked} />
    </div>
  );
}

/** Primitive kind, cardinality and presentation settings for a stored field. */
export function PrimitiveSettings() {
  return (
    <div className="space-y-5">
      <FieldIdentity />
      <FieldShape />
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle id="required" label="Required" detail="Items must have at least one value." />
        <FieldToggle
          id="highlighted"
          label="Highlighted"
          detail="Show this value in item summaries."
        />
      </div>
    </div>
  );
}
