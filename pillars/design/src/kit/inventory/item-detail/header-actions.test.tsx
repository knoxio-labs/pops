import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { detailVerbs } from './detail-verbs';
import { HeaderActions } from './header-actions';

describe('HeaderActions', () => {
  it('does not render a top-level Edit action', () => {
    render(
      <HeaderActions
        itemId="itm-drill"
        verbs={detailVerbs(coreItem('itm-drill'), coreWorld)}
        world={coreWorld}
        recents={[]}
        pickerOpen={false}
        onPickerOpenChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });
});
