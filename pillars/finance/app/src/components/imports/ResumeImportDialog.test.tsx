import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { ResumeImportDialog } from './ResumeImportDialog';

import type { ParsedTransaction } from '@pops/finance';

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function makeRows(count: number): Record<string, string>[] {
  return Array.from({ length: count }, (_, i) => ({ Date: `0${i + 1}/01/2026`, Amount: '-10.00' }));
}

const onResume = vi.fn();
const onDiscard = vi.fn();

function renderDialog() {
  return render(<ResumeImportDialog open onResume={onResume} onDiscard={onDiscard} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
});

describe('ResumeImportDialog', () => {
  it('describes the file name, parsed-transaction count, and step of the persisted run', () => {
    useImportStore.setState({
      sourceFileNames: ['jan.csv'],
      parsedTransactions: [makeParsed('a'), makeParsed('b'), makeParsed('c')],
      rows: makeRows(5),
      currentStep: 4,
    });

    renderDialog();

    // Parsed transactions (3) win over raw rows (5) once parsing has happened.
    expect(
      screen.getByText(
        'You have an unfinished import of jan.csv (3 transactions) at step 4. Resume where you left off, or discard it and start fresh.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to "CSV" and the raw row count when parsing never happened', () => {
    useImportStore.setState({
      sourceFileNames: [],
      parsedTransactions: [],
      rows: makeRows(7),
      currentStep: 2,
    });

    renderDialog();

    expect(
      screen.getByText(
        'You have an unfinished import of CSV (7 transactions) at step 2. Resume where you left off, or discard it and start fresh.'
      )
    ).toBeInTheDocument();
  });

  it('wires Resume and Discard to their callbacks', () => {
    useImportStore.setState({ rows: makeRows(1), currentStep: 2 });

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('summarises a multi-file batch instead of listing every name', () => {
    useImportStore.setState({
      sourceFileNames: ['jan.csv', 'feb.csv', 'mar.csv'],
      rows: makeRows(9),
      currentStep: 2,
    });

    renderDialog();

    expect(screen.getByText(/unfinished import of jan\.csv and 2 more/)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<ResumeImportDialog open={false} onResume={onResume} onDiscard={onDiscard} />);

    expect(screen.queryByText('Resume import?')).not.toBeInTheDocument();
  });
});
