import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { testType } from '../catalogue-editor/type-tree-test-utils';
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
