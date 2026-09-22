import { ListPlus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, Input, Label } from '@pops/ui';

import { catalogueKeyFromLabel } from './types';

import type { BinaryOperation } from './FieldFormContext';
import type { CatalogueEnumOption, CatalogueField, CatalogueOperation } from './types';

function isBinaryOperation(value: unknown): value is BinaryOperation {
  return value === 'add' || value === 'subtract' || value === 'multiply' || value === 'divide';
}

/** Reads the supported closed binary expression into editor selections. */
export function expressionSelection(
  expression: unknown
): { left: string; operation: BinaryOperation; right: string } | null {
  if (typeof expression !== 'object' || expression === null) return null;
  const root = expression as Record<string, unknown>;
  if (!isBinaryOperation(root.op)) return null;
  if (
    typeof root.left !== 'object' ||
    root.left === null ||
    typeof root.right !== 'object' ||
    root.right === null
  )
    return null;
  const left = root.left as Record<string, unknown>;
  const right = root.right as Record<string, unknown>;
  if (
    left.op !== 'read' ||
    right.op !== 'read' ||
    typeof left.fieldId !== 'string' ||
    typeof right.fieldId !== 'string'
  )
    return null;
  return { left: left.fieldId, operation: root.op, right: right.fieldId };
}

/** Edits the persisted options attached to an enum field. */
export function EnumOptions({
  field,
  onOperation,
}: {
  readonly field: CatalogueField;
  readonly onOperation: (operation: CatalogueOperation) => void;
}) {
  const [label, setLabel] = useState('');
  const key = catalogueKeyFromLabel(label);
  return (
    <section className="space-y-3 rounded-lg border">
      <div className="p-3">
        <h4 className="font-medium">Options</h4>
        <p className="text-sm text-muted-foreground">
          Archived options remain readable on existing items.
        </p>
      </div>
      {field.enumOptions.map((option) => (
        <OptionRow key={option.id} fieldId={field.id} option={option} onOperation={onOperation} />
      ))}
      <div className="grid gap-2 border-t p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="new-option-label">Option label</Label>
          <Input
            id="new-option-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-option-key">Key</Label>
          <Input id="new-option-key" className="font-mono" value={key} readOnly />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={label.trim() === '' || key === ''}
          onClick={() => {
            onOperation({
              kind: 'put_enum_option',
              fieldId: field.id,
              key,
              label: label.trim(),
              sortOrder: field.enumOptions.length,
            });
            setLabel('');
          }}
        >
          <ListPlus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </section>
  );
}

function OptionRow({
  fieldId,
  onOperation,
  option,
}: {
  readonly fieldId: string;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly option: CatalogueEnumOption;
}) {
  const [label, setLabel] = useState(option.label);
  const disabled =
    option.archivedAt !== null || label.trim() === option.label || label.trim() === '';
  return (
    <div className="grid min-h-11 gap-2 border-t p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="space-y-1">
        <Input
          aria-label={`Label for ${option.key}`}
          value={label}
          disabled={option.archivedAt !== null}
          onChange={(event) => setLabel(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{option.key}</span>
          {option.archivedAt !== null ? ' · archived' : ''}
        </p>
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onOperation({ kind: 'put_enum_option', id: option.id, fieldId, label: label.trim() })
          }
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
        <OptionLifecycleButton fieldId={fieldId} option={option} onOperation={onOperation} />
      </div>
    </div>
  );
}

function OptionLifecycleButton({
  fieldId,
  onOperation,
  option,
}: {
  readonly fieldId: string;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly option: CatalogueEnumOption;
}) {
  const archived = option.archivedAt !== null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="min-h-11 min-w-11"
      aria-label={`${archived ? 'Restore' : 'Archive'} ${option.label}`}
      onClick={() =>
        onOperation(
          archived
            ? { kind: 'put_enum_option', id: option.id, fieldId, archivedAt: null }
            : { kind: 'archive_enum_option', id: option.id }
        )
      }
    >
      {archived ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
