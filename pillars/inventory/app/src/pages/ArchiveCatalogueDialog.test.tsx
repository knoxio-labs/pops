import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { testType } from '../catalogue-editor/type-tree-test-utils';
import { ArchiveCatalogueDialog } from './ArchiveCatalogueDialog';

const bedding = testType('bedding', 'Bedding', null);
const sheet = testType('sheet', 'Sheet', 'bedding');
const archivedPillowcase = testType('pillowcase', 'Pillowcase', 'sheet', {
  archivedAt: '2026-09-26T00:00:00.000Z',
});

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
    render(
      <ArchiveCatalogueDialog
        issues={[
          {
            code: 'type_parent_archived',
            definitionId: sheet.id,
            message: 'A live type cannot inherit from an archived parent',
            path: 'parentTypeId',
          },
        ]}
        onOpenChange={vi.fn()}
        onOperation={onOperation}
        target={{ kind: 'type', id: bedding.id, label: bedding.label }}
        types={[bedding, { ...sheet, parentTypeId: null }, archivedPillowcase]}
      />
    );

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Sheet');
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
  });
});
