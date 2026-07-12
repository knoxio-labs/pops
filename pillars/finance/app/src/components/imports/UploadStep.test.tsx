import { fireEvent, render, screen } from '@testing-library/react';
import Papa from 'papaparse';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { UploadStep } from './UploadStep';

beforeEach(() => {
  useImportStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadStep — resumed run without a re-attached file', () => {
  it('advances on Next without re-parsing when parsed rows already exist', () => {
    const parseSpy = vi.spyOn(Papa, 'parse');
    useImportStore.getState().setHeaders(['Date', 'Amount']);
    useImportStore.getState().setRows([{ Date: '01/01/2026', Amount: '-10.00' }]);

    render(<UploadStep />);

    expect(
      screen.getByText(
        "Your file isn't re-attached after resuming — the parsed rows are preserved. Selecting a file starts a fresh import."
      )
    ).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(useImportStore.getState().currentStep).toBe(2);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('keeps Next disabled and shows no resume notice with neither file nor rows', () => {
    render(<UploadStep />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText(/isn't re-attached after resuming/)).not.toBeInTheDocument();
  });
});
