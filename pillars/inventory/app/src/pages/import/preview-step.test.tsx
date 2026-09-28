import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PreviewStep } from './preview-step.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { ImportRowResult } from './use-import.js';

function typeOf(
  id: string,
  key: string,
  label: string,
  parentTypeId: string | null
): CatalogueType {
  return {
    id,
    key,
    label,
    parentTypeId,
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [],
    legacyLabels: [],
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

const result: ImportRowResult = {
  row: 0,
  cells: ['Guest sheet'],
  draft: {
    name: 'Guest sheet',
    type: 'sheet',
    quantity: '1',
    code: '',
    where: '',
    note: '',
  },
  status: 'ready',
  issues: [],
};

describe('PreviewStep', () => {
  it('resolves a child type to its leaf label and hierarchy path', () => {
    render(
      <PreviewStep
        results={[result]}
        types={[
          typeOf('bedding', 'bedding', 'Bedding', null),
          typeOf('sheet', 'sheet', 'Sheet', 'bedding'),
        ]}
      />
    );

    expect(screen.getByText('Sheet')).toBeInTheDocument();
    expect(screen.getByText('Bedding › Sheet')).toBeInTheDocument();
  });
});
