import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { testType } from './type-tree-test-utils';
import { TypeForm } from './TypeForm';

import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { CatalogueIssueSource, CatalogueOperation } from './types';

const bedding = testType('bedding', 'Bedding', null);
const pillows = testType('pillows', 'Pillows', 'bedding');
const pillowcase = testType('pillowcase', 'Pillowcase', 'pillows');
const sheet = testType('sheet', 'Sheet', 'bedding');
const storage = testType('storage', 'Storage', 'bedding');
const shelf = testType('shelf', 'Shelf', 'storage');
const bin = testType('bin', 'Bin', 'shelf');
const archived = testType('archived', 'Archived', null, {
  archivedAt: '2026-09-26T00:00:00.000Z',
});
const types = [bedding, pillows, pillowcase, sheet, storage, shelf, bin, archived];

function renderForm(
  options: {
    readonly issueSources?: readonly CatalogueIssueSource[];
    readonly issues?: readonly InventoryApiIssue[];
    readonly published?: boolean;
    readonly type?: typeof pillows;
  } = {}
) {
  const onSave = vi.fn();
  render(
    <TypeForm
      isPending={false}
      issueSources={options.issueSources}
      issues={options.issues}
      onSave={onSave}
      published={options.published}
      type={options.type}
      types={types}
    />
  );
  return onSave;
}

describe('TypeForm parent chooser', () => {
  it('excludes self, descendants, archived types, and over-depth parents', () => {
    renderForm({ type: pillows });

    const reasons = screen.getByRole('list', { name: 'Parent choice reasons' });
    expect(reasons).toHaveTextContent('Pillows: A type cannot be its own parent.');
    expect(reasons).toHaveTextContent(
      'Pillowcase: A type cannot be parented below its descendant.'
    );
    expect(reasons).toHaveTextContent('Archived: Archived types cannot become parents.');
    expect(reasons).toHaveTextContent(
      'Bedding › Storage › Shelf › Bin: Depth 6 exceeds the cap of 5.'
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Parent' }));

    expect(screen.getByRole('option', { name: 'Bedding' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
    expect(screen.getByRole('option', { name: 'Bedding › Pillows' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Bedding › Pillows › Pillowcase' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Bedding › Sheet' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
    expect(screen.getByRole('option', { name: 'Bedding › Storage › Shelf › Bin' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Archived' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('writes the selected parent id into a new type operation', () => {
    const onSave = renderForm();

    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Blanket' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bedding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'put_type',
        key: 'blanket',
        label: 'Blanket',
        parentTypeId: 'bedding',
      })
    );
  });

  it('writes null when the explicit Top level parent option is selected', () => {
    const onSave = renderForm({ type: pillows });

    fireEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    fireEvent.click(screen.getByRole('option', { name: 'Top level' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save type' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ parentTypeId: null }));
  });

  it('renders a published parent as a refusal instead of an editable chooser', () => {
    renderForm({ published: true, type: pillows });

    expect(screen.getByText('Published type parent cannot change')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Pillows is published with parent Bedding. This editor draws the refusal; it does not offer a migration.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Parent' })).not.toBeInTheDocument();
  });

  it('renders each parent validation code beside the parent control', () => {
    const issues = [
      'type_parent_unknown',
      'type_parent_cycle',
      'type_depth_exceeded',
      'type_parent_archived',
    ].map((code) => ({
      code,
      definitionId: pillows.id,
      message: `${code} message`,
      path: 'parentTypeId',
    }));
    render(
      <TypeForm isPending={false} issues={issues} onSave={vi.fn()} type={pillows} types={types} />
    );

    for (const issue of issues) expect(screen.getByText(issue.message)).toBeInTheDocument();
  });

  it('anchors a minted new-type parent issue to the parent control', () => {
    const operation = {
      kind: 'put_type',
      key: 'blanket',
      label: 'Blanket',
      description: null,
      capabilities: [],
      parentTypeId: 'bedding',
    } satisfies CatalogueOperation;
    const issue: InventoryApiIssue = {
      code: 'type_parent_unknown',
      definitionId: 'minted-type-id',
      message: 'Parent type could not be found.',
      path: 'parentTypeId',
    };
    const unrelatedIssue: InventoryApiIssue = {
      ...issue,
      message: 'Unrelated parent issue',
    };
    const unrelatedOperation: CatalogueOperation = { ...operation, key: 'other', label: 'Other' };
    renderForm({
      issues: [issue, unrelatedIssue],
      issueSources: [
        {
          issues: [issue],
          operations: [operation],
        },
        { issues: [unrelatedIssue], operations: [unrelatedOperation] },
      ],
    });

    fireEvent.change(screen.getByLabelText('Type label'), { target: { value: 'Blanket' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bedding' }));

    expect(screen.getByText('Parent type could not be found.')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated parent issue')).not.toBeInTheDocument();
  });
});
