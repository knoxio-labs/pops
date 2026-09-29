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

import { fieldKindHint } from './field-kind-hints';
import { useFieldFormContext } from './FieldFormContext';
import { issueBelongsToDefinition } from './validation-issues';

import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { FieldKind } from './FieldFormContext';
import type { CatalogueIssueSources, CatalogueOperation } from './types';
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
  readonly issueSources?: CatalogueIssueSources;
  readonly issues?: readonly InventoryApiIssue[];
  readonly operation: CatalogueOperation | null;
  readonly onKeyChange: (value: string) => void;
  readonly onLabelChange: (value: string) => void;
}

const EMPTY_ISSUES: readonly InventoryApiIssue[] = [];
const EMPTY_ISSUE_SOURCES: CatalogueIssueSources = [];
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
function IdentityInputs({
  issueSources = EMPTY_ISSUE_SOURCES,
  issues = EMPTY_ISSUES,
  onKeyChange,
  onLabelChange,
  operation,
}: Props) {
  const { field, help, keyValue, label, setHelp } = useFieldFormContext();
  const keyIssues = issues.filter(
    (issue) =>
      issue.path === 'key' && issueBelongsToDefinition(issue, field?.id, operation, issueSources)
  );
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
        {keyIssues.map((issue) => (
          <p
            key={`${issue.code}-${issue.definitionId ?? 'catalogue'}`}
            role="alert"
            className="text-sm text-destructive"
          >
            {issue.message}
          </p>
        ))}
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
  const hint = fieldKindHint(kind);
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
        {hint !== null && <p className="text-xs text-muted-foreground">{hint}</p>}
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
