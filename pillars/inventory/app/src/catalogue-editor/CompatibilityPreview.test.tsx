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
      classification: 'forbidden',
      discardedOverrides: [],
    },
    operations: [],
  };
}

describe('CompatibilityPreview type-tree changes', () => {
  it('renders the POPS-4851 copy for parent and migration compatibility codes', () => {
    render(
      <CompatibilityPreview
        readiness={readiness([
          {
            classification: 'forbidden',
            code: 'published_type_parent_changed',
            definitionId: 'sheet',
          },
          {
            classification: 'protocol_gated',
            code: 'type_parent_set',
            definitionId: 'pillowcase',
          },
          {
            classification: 'migration_required',
            code: 'migration_through_subtypes_unsupported',
            definitionId: 'bedding',
          },
        ])}
      />
    );

    expect(screen.getByText('Published type parent cannot change')).toBeInTheDocument();
    expect(screen.getByText('Type parent set')).toBeInTheDocument();
    expect(screen.getByText('Required changes stop at the parent boundary')).toBeInTheDocument();
    expect(
      screen.getByText('This editor draws the refusal; it does not offer a migration.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('New subtypes require the type-tree protocol before they can be published.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The web editor does not invent a migration. Keep the field optional or make the change through the supported catalogue workflow.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('published_type_parent_changed')).toBeInTheDocument();
    expect(screen.getByText('type_parent_set')).toBeInTheDocument();
    expect(screen.getByText('migration_through_subtypes_unsupported')).toBeInTheDocument();
  });
});
