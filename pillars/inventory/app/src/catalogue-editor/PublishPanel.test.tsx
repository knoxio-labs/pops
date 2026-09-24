import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../inventory-api-helpers';
import { PublishPanel } from './PublishPanel';

import type { CatalogueCompatibility, CatalogueDescriptor, CatalogueReadiness } from './types';

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
    discardedOverrides: [],
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

function renderPanel(
  {
    error = null,
    readiness,
  }: {
    readonly error?: unknown;
    readonly readiness: CatalogueReadiness;
  } = { readiness: { status: 'not_previewed' } }
) {
  const onPublish = vi.fn();
  const onReload = vi.fn();
  const onRecheck = vi.fn();
  render(
    <PublishPanel
      catalogue={catalogue}
      readiness={readiness}
      error={error}
      isPending={false}
      onAbandon={vi.fn()}
      onPublish={onPublish}
      onReload={onReload}
      onRecheck={onRecheck}
    />
  );
  return { onPublish, onReload, onRecheck };
}

describe('PublishPanel', () => {
  it('shows a complete protocol-gated preview without blocking publication review', () => {
    renderPanel({
      readiness: { status: 'ready', compatibility: compatibility('protocol_gated') },
    });

    expect(
      screen.getByText('Protocol gated · 12 affected items · 1 affected definitions')
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Dry-run validation' })).toBeInTheDocument();
    expect(screen.getByText('Protocol gated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeEnabled();
  });

  it('shows a compatible preview and allows publication review', () => {
    renderPanel({ readiness: { status: 'ready', compatibility: compatibility('compatible') } });

    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeEnabled();
    expect(screen.getAllByText('Compatible').length).toBeGreaterThan(0);
  });

  it.each(['migration_required', 'forbidden'] as const)(
    'blocks publication for %s compatibility',
    (classification) => {
      renderPanel({ readiness: { status: 'ready', compatibility: compatibility(classification) } });

      expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
      expect(
        screen.getByText(
          /cannot publish without replacing the incompatible definition or supplying the explicit named migration/u
        )
      ).toBeInTheDocument();
    }
  );

  it('blocks publication for a resumed draft that has never been previewed', () => {
    renderPanel({ readiness: { status: 'not_previewed' } });

    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    expect(screen.getByText('Not yet previewed')).toBeInTheDocument();
    expect(screen.queryByText('Passed')).not.toBeInTheDocument();
  });

  it('lets a stale preview re-check the persisted draft without repeating the edit', () => {
    const { onRecheck } = renderPanel({ readiness: { status: 'stale' } });

    expect(screen.getByText(/Recheck or repeat the edit/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recheck' }));

    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('blocks publication when the last preview no longer matches the current draft', () => {
    renderPanel({ readiness: { status: 'stale' } });

    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText(/last preview is stale/u)).toBeInTheDocument();
  });

  it('blocks publication for a live preview of an unsaved edit, even when compatible', () => {
    renderPanel({
      readiness: { status: 'live_preview', compatibility: compatibility('compatible') },
    });

    expect(screen.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    expect(screen.getByText('Compatible (unsaved)')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Live preview of an unsaved edit\. Save it to validate the persisted draft\./u
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Passed')).not.toBeInTheDocument();
  });

  it('never labels a migration-required or forbidden result Passed', () => {
    renderPanel({
      readiness: { status: 'ready', compatibility: compatibility('migration_required') },
    });

    expect(screen.queryByText('Passed')).not.toBeInTheDocument();
    expect(screen.getAllByText('Migration required').length).toBeGreaterThan(0);
  });

  it('renders every structured validation issue returned by Inventory', () => {
    renderPanel({
      readiness: { status: 'not_previewed' },
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
    const { onPublish } = renderPanel({
      readiness: { status: 'ready', compatibility: compatibility('protocol_gated') },
    });
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
