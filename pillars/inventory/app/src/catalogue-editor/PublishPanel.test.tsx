import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers';
import { PublishPanel } from './PublishPanel';

import type { CatalogueCompatibility, CatalogueDescriptor } from './types';

const catalogue: CatalogueDescriptor = {
  revision: {
    abandoned: null,
    baseRevision: 6,
    created: { actor: { id: null, kind: 'web', label: 'Owner' }, at: '2026-09-23T00:00:00.000Z' },
    minimumProtocol: 2,
    draftVersion: 1,
    published: null,
    revision: 7,
    status: 'draft',
  },
  types: [],
};

function compatibility(
  classification: CatalogueCompatibility['classification']
): CatalogueCompatibility {
  return {
    affectedIds: ['field-voltage'],
    affectedItems: 12,
    changes: [
      {
        classification,
        code: 'field_shape_changed',
        definitionId: 'field-voltage',
      },
    ],
    classification,
  };
}

function renderPanel({
  classification = 'compatible',
  error = null,
}: {
  readonly classification?: CatalogueCompatibility['classification'];
  readonly error?: unknown;
} = {}) {
  const onPublish = vi.fn();
  const onReload = vi.fn();
  render(
    <PublishPanel
      catalogue={catalogue}
      compatibility={compatibility(classification)}
      error={error}
      isPending={false}
      onAbandon={vi.fn()}
      onPublish={onPublish}
      onReload={onReload}
    />
  );
  return { onPublish, onReload };
}

describe('PublishPanel', () => {
  it('shows a complete protocol-gated preview without blocking publication review', () => {
    renderPanel({ classification: 'protocol_gated' });

    expect(
      screen.getByText('Protocol gated · 12 affected items · 1 affected definitions')
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Dry-run validation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeEnabled();
  });

  it.each(['migration_required', 'forbidden'] as const)(
    'blocks publication for %s compatibility',
    (classification) => {
      renderPanel({ classification });

      expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
      expect(
        screen.getByText(
          /cannot publish without replacing the incompatible definition or supplying the explicit named migration/u
        )
      ).toBeInTheDocument();
    }
  );

  it('renders every structured validation issue returned by Inventory', () => {
    renderPanel({
      error: new InventoryApiError('Catalogue validation failed', 400, 'catalogue_invalid', [
        {
          code: 'fixed_unit_required',
          definitionId: 'field-voltage',
          message: 'Fixed unit is required',
          path: 'fixedUnit',
        },
        {
          code: 'reference_target_required',
          definitionId: 'field-stored-with',
          message: 'Choose at least one target kind',
          path: 'referenceKinds',
        },
      ]),
    });

    expect(screen.getByText('Catalogue validation failed')).toBeInTheDocument();
    expect(screen.getByText('Fixed unit is required')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one target kind')).toBeInTheDocument();
  });

  it('validates publication protocol and trims the submitted note', () => {
    const { onPublish } = renderPanel({ classification: 'protocol_gated' });
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish' }));
    fireEvent.change(screen.getByLabelText('Publication note'), {
      target: { value: '  Adds date-time fields  ' },
    });
    fireEvent.change(screen.getByLabelText('Minimum client protocol'), {
      target: { value: '0' },
    });
    expect(screen.getByRole('button', { name: 'Publish revision' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minimum client protocol'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish revision' }));

    expect(onPublish).toHaveBeenCalledWith({
      minimumProtocol: 3,
      note: 'Adds date-time fields',
    });
  });
});
