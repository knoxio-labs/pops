import { render, screen } from '@testing-library/react';
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
describe('ColumnMapStep — split-amount bank (POPS-29)', () => {
  it('offers no Amount field for ING and lets the step proceed without one', () => {
    useImportStore.getState().setDialectId('ING');
    useImportStore.getState().setHeaders(['Date', 'Description', 'Credit', 'Debit', 'Balance']);
    useImportStore.getState().setRows([
      {
        Date: '14/08/2026',
        Description: 'WOOLWORTHS',
        Credit: '',
        Debit: '-52.30',
        Balance: '1.00',
      },
    ]);
    const { container } = render(<ColumnMapStep />);

    expect(container.querySelector('select[name="amount"]')).toBeNull();
    expect(getDateSelect(container)).toHaveValue('Date');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('→ -52.3')).toBeInTheDocument();
  });

  it('still requires an Amount mapping for a single-column bank', () => {
    const { container } = render(<ColumnMapStep />);
    expect(container.querySelector('select[name="amount"]')).not.toBeNull();
  });
});

describe('ColumnMapStep — nothing auto-detected', () => {
  it('says nothing matched instead of showing four blank dropdowns', () => {
    useImportStore.getState().setHeaders(['Column 1', 'Column 2', 'Column 3']);
    useImportStore
      .getState()
      .setRows([{ 'Column 1': '31/07/2026', 'Column 2': '-23.22', 'Column 3': 'MERCHANT' }]);

    render(<ColumnMapStep />);

    expect(screen.getByText('No columns matched automatically')).toBeInTheDocument();
  });

  it('drops the notice once a field is mapped by hand', async () => {
    const user = userEvent.setup();
    useImportStore.getState().setHeaders(['Column 1', 'Column 2', 'Column 3']);
    useImportStore
      .getState()
      .setRows([{ 'Column 1': '31/07/2026', 'Column 2': '-23.22', 'Column 3': 'MERCHANT' }]);

    const { container } = render(<ColumnMapStep />);
    await user.selectOptions(getDateSelect(container), 'Column 1');

    expect(screen.queryByText('No columns matched automatically')).not.toBeInTheDocument();
  });

  it('shows no notice when the headers are recognisable', () => {
    render(<ColumnMapStep />);

    expect(screen.queryByText('No columns matched automatically')).not.toBeInTheDocument();
  });
});
