import { Archive, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { ancestorIds } from '../lib/type-tree';
import { FieldOutlineItem } from './FieldOutlineItem';
import { InheritedFieldGroup } from './InheritedFieldGroup';

import type { CatalogueField, CatalogueType } from './types';

interface FieldOutlineProps {
  readonly fields: readonly CatalogueField[];
  readonly onAdd: () => void;
  readonly onMove: (fieldId: string, direction: -1 | 1) => void;
  readonly onSelect: (id: string) => void;
  readonly onSelectType?: (id: string) => void;
  readonly selectedId: string | null;
  readonly type?: CatalogueType;
  readonly types?: readonly CatalogueType[];
}

const EMPTY_TYPES: readonly CatalogueType[] = [];

/** Ordered field outline with keyboard-operable reorder controls. */
export function FieldOutline({
  fields,
  onAdd,
  onMove,
  onSelect,
  onSelectType,
  selectedId,
  type,
  types = EMPTY_TYPES,
}: FieldOutlineProps) {
  const [showArchived, setShowArchived] = useState(false);
  const activeFields = fields.filter((field) => field.archivedAt === null);
  const visibleFields = showArchived ? fields : activeFields;
  const archivedCount = fields.length - activeFields.length;
  const inheritedGroups =
    type === undefined
      ? []
      : ancestorIds(types, type.id)
          .map((ancestorId) => types.find((candidate) => candidate.id === ancestorId))
          .filter((ancestor): ancestor is CatalogueType => ancestor !== undefined)
          .map((ancestor) => ({
            ancestor,
            fields: ancestor.fields
              .filter((field) => showArchived || field.archivedAt === null)
              .toSorted(
                (left, right) =>
                  left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
              ),
          }));
  return (
    <section className="space-y-4">
      <FieldOutlineHeader onAdd={onAdd} />
      <InheritedFields groups={inheritedGroups} label={type?.label} onSelectType={onSelectType} />
      <OwnFieldList
        fields={visibleFields}
        onMove={onMove}
        onSelect={onSelect}
        selectedId={selectedId}
      />
      <ArchivedFieldsButton
        count={archivedCount}
        onToggle={() => setShowArchived((shown) => !shown)}
        shown={showArchived}
      />
    </section>
  );
}

function FieldOutlineHeader({ onAdd }: { readonly onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="font-semibold">Fields</h3>
        <p className="text-xs text-muted-foreground">Set item form order</p>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Field
      </Button>
    </div>
  );
}

function InheritedFields({
  groups,
  label,
  onSelectType,
}: {
  readonly groups: readonly {
    readonly ancestor: CatalogueType;
    readonly fields: readonly CatalogueField[];
  }[];
  readonly label: string | undefined;
  readonly onSelectType?: (id: string) => void;
}) {
  return (
    <>
      {groups.map(({ ancestor, fields }) => (
        <InheritedFieldGroup
          key={ancestor.id}
          ancestor={ancestor}
          fields={fields}
          onSelectType={onSelectType}
        />
      ))}
      {groups.length > 0 && <h4 className="text-sm font-semibold">{label} fields</h4>}
    </>
  );
}

function OwnFieldList({
  fields,
  onMove,
  onSelect,
  selectedId,
}: {
  readonly fields: readonly CatalogueField[];
  readonly onMove: (fieldId: string, direction: -1 | 1) => void;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | null;
}) {
  return (
    <div className="space-y-1">
      {fields.map((field, index) => (
        <FieldOutlineItem
          key={field.id}
          field={field}
          index={index}
          total={fields.length}
          selected={selectedId === field.id}
          onMove={onMove}
          onSelect={onSelect}
        />
      ))}
      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Add the first field.
        </p>
      )}
    </div>
  );
}

function ArchivedFieldsButton({
  count,
  onToggle,
  shown,
}: {
  readonly count: number;
  readonly onToggle: () => void;
  readonly shown: boolean;
}) {
  if (count === 0) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start text-muted-foreground"
      onClick={onToggle}
    >
      <Archive className="h-4 w-4" />
      {shown ? 'Hide archived fields' : `Show archived fields (${count})`}
    </Button>
  );
}
