import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { overviewLabels } from './test-utils';
import { WorkspaceControls } from './WorkspaceControls';

afterEach(cleanup);

it('keeps every display and filter button at the workspace touch-target height', () => {
  render(
    <WorkspaceControls
      labels={overviewLabels}
      query=""
      onQueryChange={vi.fn()}
      display="sheet"
      onDisplayChange={vi.fn()}
      filter="everything"
      onFilterChange={vi.fn()}
    />
  );

  for (const label of [
    'workspace.sheet',
    'workspace.journey',
    'workspace.everything',
    'workspace.needs-attention',
    'workspace.booked',
  ]) {
    expect(screen.getByRole('button', { name: label }).className).toContain('min-h-11');
  }
});
