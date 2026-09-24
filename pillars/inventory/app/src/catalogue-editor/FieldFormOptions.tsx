import { ListPlus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, Input, Label } from '@pops/ui';

import { OptionMoveButtons } from './OptionMoveButtons';
import { reorderOption } from './reorder';
import { catalogueKeyFromLabel } from './types';

import type { CatalogueEnumOption, CatalogueField, CatalogueOperation } from './types';

/** Edits the persisted options attached to an enum field. */
export function EnumOptions({
  field,
  onOperation,
}: {
  readonly field: CatalogueField;
  readonly onOperation: (operation: CatalogueOperation) => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border">
      <div className="p-3">
        <h4 className="font-medium">Options</h4>
        <p className="text-sm text-muted-foreground">
          Archived options remain readable on existing items.
        </p>
      </div>
      {field.enumOptions.map((option) => (
        <OptionRow
          key={option.id}
          fieldId={field.id}
          option={option}
          options={field.enumOptions}
          onOperation={onOperation}
        />
      ))}
      <NewOptionForm field={field} onOperation={onOperation} />
    </section>
  );
}

function NewOptionForm({
  field,
  onOperation,
}: {
  readonly field: CatalogueField;
  readonly onOperation: (operation: CatalogueOperation) => void;
}) {
  const [label, setLabel] = useState('');
  const key = catalogueKeyFromLabel(label);
  return (
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
  );
}

function OptionRow({
  fieldId,
  onOperation,
  option,
  options,
}: {
  readonly fieldId: string;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly option: CatalogueEnumOption;
  readonly options: readonly CatalogueEnumOption[];
}) {
  const [label, setLabel] = useState(option.label);
  const archived = option.archivedAt !== null;
  const disabled = archived || label.trim() === option.label || label.trim() === '';
  const active = options.filter((candidate) => candidate.archivedAt === null);
  const activeIndex = active.findIndex((candidate) => candidate.id === option.id);
  return (
    <div className="grid min-h-11 gap-2 border-t p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <OptionMoveButtons
        disabled={archived}
        isFirst={activeIndex <= 0}
        isLast={activeIndex === active.length - 1}
        label={option.label}
        onMove={(direction) => onOperation(reorderOption(options, option.id, direction, fieldId))}
      />
      <div className="space-y-1">
        <Input
          aria-label={`Label for ${option.key}`}
          value={label}
          disabled={archived}
          onChange={(event) => setLabel(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{option.key}</span>
          {archived ? ' · archived' : ''}
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
