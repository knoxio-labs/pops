import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompatibilityPreview } from './CompatibilityPreview';

import type { CatalogueCompatibility, CatalogueReadiness } from './types';

function readiness(changes: CatalogueCompatibility['changes']): CatalogueReadiness {
  return {
    status: 'ready',
    compatibility: {
      affectedIds: [],
      affectedItems: 0,
      changes,
      classification: 'migration_required',
      discardedOverrides: [],
    },
    operations: [],
  };
}

describe('CompatibilityPreview type-tree changes', () => {
  it('renders the migration copy for parent and protocol compatibility codes', () => {
    render(
      <CompatibilityPreview
        readiness={readiness([
          {
            classification: 'migration_required',
            code: 'published_type_parent_changed',
            definitionId: 'sheet',
          },
          {
            classification: 'protocol_gated',
            code: 'type_parent_set',
            definitionId: 'pillowcase',
          },
        ])}
      />
    );

    expect(screen.getByText('Published type parent change requires migration')).toBeInTheDocument();
    expect(screen.getByText('Type parent set')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Publish this parent change with a migration covering the type and its descendants.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('New subtypes require the type-tree protocol before they can be published.')
    ).toBeInTheDocument();
    expect(screen.getByText('published_type_parent_changed')).toBeInTheDocument();
    expect(screen.getByText('type_parent_set')).toBeInTheDocument();
  });
});
