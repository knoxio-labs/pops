import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import { arrangementRows } from './model';
import { ArrangementStateLabels } from './state-labels';

function sourceRow() {
  const row = arrangementRows(createArrangementState()).find((entry) => entry.id === 'flight');
  if (!row) throw new Error('Expected transport source');
  return row;
}

describe('booking state is separate from purchase evidence', () => {
  it.each(['Booked', 'Agreed', 'Reserved'])(
    'keeps %s visible without claiming purchase',
    (status) => {
      render(<ArrangementStateLabels row={{ ...sourceRow(), status, purchased: false }} />);
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getByText('In plan')).toBeInTheDocument();
      expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
    }
  );
});
