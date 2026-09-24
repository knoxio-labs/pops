import { kitchen12Uncoded, printBoxes } from '@/fixtures/inventory-print';
import { office04WithContents } from '@/fixtures/inventory-print-office';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrintLabelsPage } from './print-labels-page';

import type { PrintJobSeed } from './use-print-job';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage(seed: PrintJobSeed) {
  return render(<PrintLabelsPage seed={seed} source="Test" catalogue={[]} lookup={() => null} />);
}

const boxes: PrintJobSeed = { subjects: printBoxes, template: 'container', layoutId: 'a4-8' };

describe('PrintLabelsPage', () => {
  it('lays a long job over as many sheets as it needs', () => {
    renderPage({ subjects: office04WithContents, template: 'item', layoutId: 'a4-14', startAt: 7 });
    expect(screen.getByLabelText('Sheet 3 of 3')).toBeTruthy();
    expect(screen.getByText('25 labels on 3 sheets, from label 7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print 25 labels' })).toBeTruthy();
  });

  it('starts the job at the label chosen on the first sheet', () => {
    renderPage(boxes);
    expect(screen.getByText('6 labels on 1 sheet, labels 1–6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start at label 5' }));
    expect(screen.getByText('6 labels on 2 sheets, from label 5')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot-kind="used"]')).toHaveLength(4);
  });

  it('prints every copy of each label', () => {
    renderPage({ ...boxes, copies: 2 });
    expect(screen.getByRole('button', { name: 'Print 12 labels' })).toBeTruthy();
  });

  it('cannot print an empty job', () => {
    renderPage({ ...boxes, subjects: [] });
    const print = screen.getByRole('button', { name: 'Print labels' });
    expect(print).toHaveProperty('disabled', true);
    expect(screen.getByText('Nothing to print')).toBeTruthy();
  });

  it('moves the start only when the person says the sheet printed', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(boxes);
    fireEvent.click(screen.getByRole('button', { name: 'Print 6 labels' }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, next starts at 7' }));
    expect(screen.getByText('Next print starts at label 7.')).toBeTruthy();
  });

  it('leaves the start alone when printing was cancelled', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(boxes);
    fireEvent.click(screen.getByRole('button', { name: 'Print 6 labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.getByText('Nothing printed. The sheet still starts at label 1.')).toBeTruthy();
  });

  it('gives every uncoded item its suggested code in one action', () => {
    renderPage({ subjects: kitchen12Uncoded, template: 'container', layoutId: 'a4-14' });
    expect(
      screen.getByText('2 items have no code. The label shows the name instead.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 codes' }));
    expect(screen.queryByText(/no code/i)).toBeNull();
    expect(screen.getAllByText('KIT-031').length).toBeGreaterThan(0);
  });

  it('refuses a code another item holds and offers the next free one', () => {
    const cups = kitchen12Uncoded[2];
    render(
      <PrintLabelsPage
        seed={{ subjects: kitchen12Uncoded, template: 'container', layoutId: 'a4-14' }}
        source="Test"
        catalogue={[]}
        lookup={(code) =>
          code === 'KIT-030' ? { holder: 'Coffee grinder', suggestion: 'KIT-031' } : null
        }
        editSeed={{ id: cups?.id ?? '', draft: 'KIT-030' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save code' }));
    expect(screen.getByRole('alert').textContent).toContain('KIT-030 is on Coffee grinder');
    fireEvent.click(screen.getByRole('button', { name: 'Use KIT-031' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save code' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('1 item has no code. The label shows the name instead.')).toBeTruthy();
  });
});
