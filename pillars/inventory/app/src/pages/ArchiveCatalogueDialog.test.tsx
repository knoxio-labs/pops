import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { testField, testType } from '../catalogue-editor/type-tree-test-utils';
import { ArchiveCatalogueDialog } from './ArchiveCatalogueDialog';

import type { CatalogueIssueSource, CatalogueOperation } from '../catalogue-editor/types';
import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { ArchiveTarget } from './cataloguePageTypes';

const bedding = testType('bedding', 'Bedding', null);
const sheet = testType('sheet', 'Sheet', 'bedding');
const archivedPillowcase = testType('pillowcase', 'Pillowcase', 'sheet', {
  archivedAt: '2026-09-26T00:00:00.000Z',
});
const serverIssue: InventoryApiIssue = {
  code: 'type_parent_archived',
  definitionId: sheet.id,
  message: 'A live type cannot inherit from an archived parent',
  path: 'parentTypeId',
};

describe('ArchiveCatalogueDialog', () => {
  it('refuses archiving a type with live children and names the blockers', () => {
    const onOperation = vi.fn();
    render(
      <ArchiveCatalogueDialog
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'type', id: bedding.id, label: bedding.label }}
        types={[bedding, sheet, archivedPillowcase]}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Move or archive the live children first.');
    expect(dialog).toHaveTextContent('Sheet');
    expect(dialog).not.toHaveTextContent('Pillowcase');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onOperation).not.toHaveBeenCalled();
  });

  it('uses the server child issue when the local tree is stale', () => {
    const onOperation = vi.fn();
    const issueSource: CatalogueIssueSource = {
      issues: [serverIssue],
      operations: [{ kind: 'archive_type', id: bedding.id }],
    };
    render(
      <ArchiveCatalogueDialog
        issueSources={[issueSource]}
        issues={[serverIssue]}
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'type', id: bedding.id, label: bedding.label }}
        types={[bedding, { ...sheet, parentTypeId: null }, archivedPillowcase]}
      />
    );

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Sheet');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
  });

  it('keeps the target open when the server refuses an async archive', async () => {
    function Harness() {
      const [issues, setIssues] = useState<readonly InventoryApiIssue[]>([]);
      const [target, setTarget] = useState<ArchiveTarget | null>({
        kind: 'type',
        id: bedding.id,
        label: bedding.label,
      });
      const issueSources: readonly CatalogueIssueSource[] = [
        { issues, operations: [{ kind: 'archive_type', id: bedding.id }] },
      ];
      async function onOperation(_operation: CatalogueOperation): Promise<boolean> {
        setIssues([serverIssue]);
        return false;
      }
      return (
        <ArchiveCatalogueDialog
          issueSources={issueSources}
          issues={issues}
          onOpenChange={(open) => !open && setTarget(null)}
          onOperation={onOperation}
          target={target}
          types={[bedding, { ...sheet, parentTypeId: null }, archivedPillowcase]}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(screen.getByText('Sheet')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
  });

  it('records a live type replacement when archiving a type', async () => {
    const source = testType('lamp', 'Lamp', null);
    const replacement = testType('torch', 'Torch', null);
    const archived = testType('retired', 'Retired', null, {
      archivedAt: '2026-09-26T00:00:00.000Z',
    });
    const onOperation = vi.fn();
    render(
      <ArchiveCatalogueDialog
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'type', id: source.id, label: source.label }}
        types={[source, replacement, archived]}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Record replacement' });
    expect(screen.getByRole('option', { name: 'Torch (torch)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Lamp (lamp)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired (retired)' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: replacement.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(onOperation).toHaveBeenCalledWith({
        kind: 'archive_type',
        id: source.id,
        replacedBy: replacement.id,
      })
    );
  });

  it('offers only live same-shape fields on the field type and records the selected replacement', async () => {
    const sourceTypeId = 'lamp';
    const source = testField('finish', sourceTypeId, 'finish', { label: 'Finish' });
    const replacement = testField('finish-coat', sourceTypeId, 'finish_coat', {
      label: 'Finish coat',
    });
    const archived = testField('old-finish', sourceTypeId, 'old_finish', {
      archivedAt: '2026-09-26T00:00:00.000Z',
      label: 'Old finish',
    });
    const differentKind = testField('voltage', sourceTypeId, 'voltage', {
      kind: 'integer',
      label: 'Voltage',
    });
    const differentCardinality = testField('finishes', sourceTypeId, 'finishes', {
      cardinality: 'many',
      label: 'Finishes',
    });
    const otherTypeId = 'torch';
    const otherTypeField = testField('other-finish', otherTypeId, 'finish', {
      label: 'Other finish',
    });
    const sourceType = testType('lamp', 'Lamp', null, {
      fields: [source, replacement, archived, differentKind, differentCardinality],
    });
    const otherType = testType('torch', 'Torch', null, { fields: [otherTypeField] });
    const onOperation = vi.fn();
    render(
      <ArchiveCatalogueDialog
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'field', id: source.id, label: source.label }}
        types={[sourceType, otherType]}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Record replacement' });
    expect(screen.getByRole('option', { name: 'Finish coat (finish_coat)' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Old finish (old_finish)' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Voltage (voltage)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Finishes (finishes)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Other finish (finish)' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: replacement.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(onOperation).toHaveBeenCalledWith({
        kind: 'archive_field',
        id: source.id,
        replacedBy: replacement.id,
      })
    );
  });

  it('archives without replacement lineage when no replacement is selected', async () => {
    const source = testField('finish', 'lamp', 'finish', { label: 'Finish' });
    const replacement = testField('finish-coat', 'lamp', 'finish_coat', {
      label: 'Finish coat',
    });
    const onOperation = vi.fn();
    render(
      <ArchiveCatalogueDialog
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'field', id: source.id, label: source.label }}
        types={[testType('lamp', 'Lamp', null, { fields: [source, replacement] })]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(onOperation).toHaveBeenCalledWith({ kind: 'archive_field', id: source.id })
    );
  });

  it('shows replacement validation refusals on the replacement control', async () => {
    const source = testField('finish', 'lamp', 'finish', { label: 'Finish' });
    const replacement = testField('finish-coat', 'lamp', 'finish_coat', {
      label: 'Finish coat',
    });
    const issue: InventoryApiIssue = {
      code: 'replacement_archived',
      definitionId: source.id,
      message: 'Replacement field is archived',
      path: 'replacedBy',
    };
    const operations: CatalogueOperation[] = [
      { kind: 'archive_field', id: source.id, replacedBy: replacement.id },
    ];

    function Harness() {
      const [issues, setIssues] = useState<readonly InventoryApiIssue[]>([]);
      const onOperation = async (): Promise<boolean> => {
        setIssues([issue]);
        return false;
      };
      return (
        <ArchiveCatalogueDialog
          issueSources={[{ issues, operations }]}
          issues={issues}
          onOpenChange={vi.fn()}
          onOperation={onOperation}
          target={{ kind: 'field', id: source.id, label: source.label }}
          types={[testType('lamp', 'Lamp', null, { fields: [source, replacement] })]}
        />
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Record replacement' }), {
      target: { value: replacement.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Replacement field is archived')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Record replacement' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('ignores a server child issue belonging to another archive target', () => {
    const other = testType('other', 'Other', null);
    const onOperation = vi.fn();
    const issueSource: CatalogueIssueSource = {
      issues: [serverIssue],
      operations: [{ kind: 'archive_type', id: bedding.id }],
    };
    render(
      <ArchiveCatalogueDialog
        issueSources={[issueSource]}
        issues={[serverIssue]}
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'type', id: other.id, label: other.label }}
        types={[bedding, sheet, other]}
      />
    );

    expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onOperation).toHaveBeenCalledWith({ kind: 'archive_type', id: other.id });
  });
});
