import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { ColumnMapStep } from './ColumnMapStep';

function getDateSelect(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector('select[name="date"]');
  if (!select) throw new Error('date select not found');
  return select as HTMLSelectElement;
}

const headers = ['Date', 'Description', 'Amount', 'Value Date'];
const rows = [
  {
    Date: '13/02/2026',
    Description: 'WOOLWORTHS 1234',
    Amount: '125.50',
    'Value Date': '14/02/2026',
  },
];

function seedUpload() {
  useImportStore.getState().setHeaders(headers);
  useImportStore.getState().setRows(rows);
}

beforeEach(() => {
  useImportStore.getState().reset();
  seedUpload();
});

afterEach(() => {
  useImportStore.getState().reset();
});

describe('ColumnMapStep — auto-detect vs. manual override (#3621)', () => {
  it('auto-detects the date column on first mount', () => {
    const { container } = render(<ColumnMapStep />);

    expect(getDateSelect(container)).toHaveValue('Date');
    expect(useImportStore.getState().columnMap.date).toBe('Date');
  });

  it('keeps a manual override after the CSV is re-parsed (new headers array, same content) and the step remounts', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<ColumnMapStep />);

    await user.selectOptions(getDateSelect(container), 'Value Date');
    expect(useImportStore.getState().columnMap.date).toBe('Value Date');

    // Simulate Back-then-Next: UploadStep re-parses the same file into a
    // fresh `headers`/`rows` array (new references, identical content), and
    // ColumnMapStep fully unmounts then remounts (single-active-step wizard).
    unmount();
    useImportStore.getState().setHeaders([...headers]);
    useImportStore.getState().setRows(rows.map((r) => ({ ...r })));
    const remounted = render(<ColumnMapStep />);

    expect(getDateSelect(remounted.container)).toHaveValue('Value Date');
    expect(useImportStore.getState().columnMap.date).toBe('Value Date');
  });
});
