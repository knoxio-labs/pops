import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createExploreState } from './fixture';
import { ExploreSourceFacts } from './source';

describe('retained capture attachments', () => {
  it('shows source files as read-only attachment chips', () => {
    const record = createExploreState().records.find((entry) => entry.source === 'capture');
    if (!record || record.source !== 'capture') throw new Error('Missing capture fixture');
    render(
      <ExploreSourceFacts
        record={{
          ...record,
          capture: {
            ...record.capture,
            files: [new File(['source'], 'invitation.pdf', { type: 'application/pdf' })],
          },
        }}
      />
    );
    const attachments = screen.getByRole('list', { name: 'Attachments' });
    expect(attachments).toHaveTextContent('invitation.pdf');
    expect(within(attachments).queryByRole('button')).not.toBeInTheDocument();
  });
});
