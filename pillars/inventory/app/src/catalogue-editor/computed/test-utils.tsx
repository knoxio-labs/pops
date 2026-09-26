import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { FieldForm } from '../FieldForm';
import { EMPTY_COMPUTED_ENVIRONMENT } from './computed-environment';

import type { CatalogueField, CatalogueOperation, CatalogueType } from '../types';
import type { ComputedFieldEnvironment } from './computed-environment';

/** Renders the field form for the box's computed Volume, returning the save spy. */
export function renderComputedField(
  options: {
    readonly volume?: Partial<CatalogueField>;
    readonly environment?: Partial<ComputedFieldEnvironment>;
    readonly isNew?: boolean;
  } = {}
) {
  const types = catalogueTypes(options.volume);
  const box = types[0];
  if (box === undefined) throw new Error('fixture has no box type');
  const volume = box.fields.find((candidate) => candidate.id === 'volume');
  const onOperation = vi.fn<(operation: CatalogueOperation) => void>();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FieldForm
        {...(options.isNew === true ? {} : { field: volume })}
        computed={{ ...EMPTY_COMPUTED_ENVIRONMENT, ...options.environment }}
        isPending={false}
        onOperation={onOperation}
        published={false}
        type={box}
        types={types}
      />
    </QueryClientProvider>
  );
  return { onOperation, view };
}

/** The expression of the last saved put_field operation. */
export function savedExpression(
  onOperation: ReturnType<typeof renderComputedField>['onOperation']
): unknown {
  const call = onOperation.mock.calls.at(-1)?.[0];
  return call?.kind === 'put_field' ? call.expression : undefined;
}

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

/** Opens a Radix select from its trigger and picks the option with `name`. */
export async function chooseOption(trigger: HTMLElement, name: string): Promise<void> {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const option = await screen.findByRole('option', { name });
  fireEvent.keyDown(option, { key: 'Enter' });
}

type FieldShape = Partial<CatalogueField> & Pick<CatalogueField, 'id' | 'label' | 'kind'>;

function field(typeId: string, shape: FieldShape, sortOrder: number): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    key: shape.id,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder,
    storage: 'stored',
    typeId,
    ...shape,
  };
}

function type(id: string, label: string, fields: readonly FieldShape[]): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: fields.map((shape, index) => field(id, shape, index)),
    id,
    key: id,
    label,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 3,
    sortOrder: 0,
  };
}

function option(id: string, label: string, sortOrder: number) {
  return { id, key: id, label, sortOrder, archivedAt: null };
}

/** The computed field every builder test edits: a box's volume in cm³. */
export const VOLUME: FieldShape = {
  id: 'volume',
  label: 'Volume',
  kind: 'measurement',
  fixedUnit: 'cm³',
  storage: 'computed',
};

/**
 * A fictional catalogue: storage boxes that reference a part, which is stored
 * in a case. Two hops reach the case, which is the traversal limit.
 */
export function catalogueTypes(volume: Partial<CatalogueField> = {}): CatalogueType[] {
  return [
    type('box', 'Storage box', [
      { id: 'width', label: 'Width', kind: 'measurement', fixedUnit: 'cm' },
      { id: 'height', label: 'Height', kind: 'measurement', fixedUnit: 'cm' },
      { id: 'depth', label: 'Depth', kind: 'measurement', fixedUnit: 'cm' },
      { id: 'label', label: 'Label', kind: 'short_text' },
      { id: 'count', label: 'Count', kind: 'integer' },
      { id: 'fragile', label: 'Fragile', kind: 'boolean' },
      {
        id: 'condition',
        label: 'Condition',
        kind: 'enum',
        enumOptions: [option('opt-new', 'New', 0), option('opt-worn', 'Worn', 1)],
      },
      {
        id: 'part_of',
        label: 'Part of',
        kind: 'reference',
        referenceKinds: ['item'],
        referenceTypeIds: ['part'],
      },
      {
        id: 'stored_with',
        label: 'Stored with',
        kind: 'reference',
        referenceKinds: ['item', 'location'],
      },
      {
        id: 'tags',
        label: 'Tags',
        kind: 'reference',
        cardinality: 'many',
        referenceKinds: ['item'],
      },
      { id: 'old_width', label: 'Old width', kind: 'decimal', archivedAt: '2026-09-01T00:00:00Z' },
      { ...VOLUME, ...volume },
    ]),
    type('part', 'Part', [
      { id: 'price', label: 'Price', kind: 'decimal' },
      { id: 'shelf', label: 'Shelf', kind: 'short_text' },
      {
        id: 'stored_in',
        label: 'Stored in',
        kind: 'reference',
        referenceKinds: ['item'],
        referenceTypeIds: ['case'],
      },
    ]),
    type('case', 'Case', [
      { id: 'code', label: 'Code', kind: 'short_text' },
      { id: 'case_shelf', label: 'Case shelf', kind: 'short_text' },
    ]),
  ];
}
