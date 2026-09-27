import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TableRow } from './table-row';

describe('TableRow actions', () => {
  it('offers Edit beside the row menu', () => {
    render(
      <TableRow
        item={coreItem('itm-drill')}
        world={coreWorld}
        density="default"
        selected={false}
        focused={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });
});
