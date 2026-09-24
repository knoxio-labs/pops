import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderComputedField } from './test-utils';

import type { InventoryApiIssue } from '../../inventory-api-helpers';
import type { CatalogueCompatibility, CatalogueField } from '../types';

const PRODUCT: Partial<CatalogueField> = {
  expressionVersion: 1,
  expression: {
    op: 'multiply',
    left: { op: 'read', path: [], fieldId: 'width' },
    right: { op: 'read', path: [], fieldId: 'height' },
  },
};

const MISMATCH: InventoryApiIssue = {
  definitionId: 'volume',
  path: 'expression.right.fieldId',
  code: 'expression_type_mismatch',
  message: 'expression.right: expected decimal, got measurement',
};

function outlineButton(path: string): HTMLElement {
  const outline = screen.getByRole('list', { name: 'Expression outline' });
  const row = outline.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (row === null) throw new Error(`no outline row at ${path}`);
  return row;
}

describe('server issues on nodes', () => {
  it('flags the node an issue path names and explains it when selected', () => {
    renderComputedField({ volume: PRODUCT, environment: { liveIssues: [MISMATCH] } });

    expect(
      within(outlineButton('expression.right')).getByLabelText('This does not fit here')
    ).toBeInTheDocument();
    expect(
      within(outlineButton('expression.left')).queryByLabelText('This does not fit here')
    ).toBeNull();
    fireEvent.click(outlineButton('expression.right'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This does not fit here');
    expect(alert).toHaveTextContent('Expected decimal, got measurement.');
  });

  it('names a product whose units cannot be derived', () => {
    renderComputedField({
      volume: PRODUCT,
      environment: {
        liveIssues: [
          {
            definitionId: 'volume',
            path: 'expression',
            code: 'expression_unit_unsupported',
            message:
              'expression: cannot derive a unit from fl oz and cm; write units as symbols joined by · with superscript powers',
          },
        ],
      },
    });

    fireEvent.click(outlineButton('expression'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('These units do not combine');
    expect(alert).toHaveTextContent('Cannot derive a unit from fl oz and cm');
  });

  it('ignores issues that belong to another definition', () => {
    renderComputedField({
      volume: PRODUCT,
      environment: { liveIssues: [{ ...MISMATCH, definitionId: 'label' }] },
    });

    expect(screen.queryByLabelText('This does not fit here')).toBeNull();
  });

  it('draws a cycle as the chain of fields that read each other', () => {
    renderComputedField({
      volume: PRODUCT,
      environment: {
        liveIssues: [
          {
            definitionId: null,
            path: 'expression',
            code: 'expression_cycle',
            message: 'computed dependency cycle: box:volume -> part:price -> box:volume',
          },
        ],
      },
    });

    const cycle = screen.getByRole('list', { name: 'Cycle' });
    expect(cycle).toHaveTextContent('Storage box › Volume');
    expect(cycle).toHaveTextContent('Part › Price');
    expect(cycle).toHaveTextContent('back to Storage box › Volume');
    expect(screen.getByRole('alert')).toHaveTextContent('Volume would read itself');
  });

  it('reports a refused save only for the edit that was refused', () => {
    renderComputedField({ volume: PRODUCT, environment: { saveIssues: [MISMATCH] } });

    expect(screen.queryByText('Not saved to the draft')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
    expect(screen.getByText('Not saved to the draft')).toBeInTheDocument();
    expect(
      within(outlineButton('expression.right')).getByLabelText('This does not fit here')
    ).toBeInTheDocument();

    fireEvent.click(outlineButton('expression.right'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove node' }));
    expect(screen.queryByText('Not saved to the draft')).toBeNull();
  });
});

describe('publish route', () => {
  const migration: CatalogueCompatibility = {
    classification: 'migration_required',
    affectedIds: ['volume'],
    affectedItems: 4,
    discardedOverrides: [{ fieldId: 'volume', items: 4 }],
    changes: [
      {
        classification: 'migration_required',
        definitionId: 'volume',
        code: 'computed_overrides_in_use',
      },
    ],
  };

  it('says the change publishes through MCP when it needs a migration', () => {
    renderComputedField({ volume: PRODUCT, environment: { compatibility: migration } });

    expect(screen.getByText('Publishes through MCP, not here.')).toBeInTheDocument();
    expect(screen.getByText('inventory.catalogue.publishDraft')).toBeInTheDocument();
  });

  it('stays quiet for a compatible change or another field’s migration', () => {
    renderComputedField({
      volume: PRODUCT,
      environment: {
        compatibility: {
          ...migration,
          changes: [{ classification: 'migration_required', definitionId: 'label', code: 'x' }],
        },
      },
    });

    expect(screen.queryByText('Publishes through MCP, not here.')).toBeNull();
  });
});
