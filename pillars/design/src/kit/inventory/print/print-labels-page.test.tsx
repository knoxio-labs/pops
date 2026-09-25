import {
  kitchen12Uncoded,
  kitchen12WithContents,
  printBoxes,
  printHandful,
} from '@/fixtures/inventory-print';
import { office04WithContents } from '@/fixtures/inventory-print-office';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CUSTOM_SHEET_STORAGE_KEY } from './custom-sheet-storage';
import { PrintLabelsPage } from './print-labels-page';

import type { PrintJobSeed } from './use-print-job';

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage(seed: PrintJobSeed) {
  return render(<PrintLabelsPage seed={seed} source="Test" catalogue={[]} lookup={() => null} />);
}

const boxes: PrintJobSeed = { subjects: printBoxes, sheetId: 'L7160' };

function printedCodes(): string[] {
  return [...document.querySelectorAll('[data-slot-kind="label"] [data-code-pt]')].map(
    (node) => node.textContent ?? ''
  );
}

describe('PrintLabelsPage', () => {
  it('gives each box two labels and each thing one', () => {
    renderPage(boxes);
    expect(screen.getByRole('button', { name: 'Print 12 labels' })).toBeTruthy();
    renderPage({ subjects: printHandful, sheetId: 'L7160' });
    expect(screen.getByRole('button', { name: 'Print 4 labels' })).toBeTruthy();
  });

  it('prints a box with its contents as one box label pair and an item label each', () => {
    renderPage({ subjects: kitchen12WithContents, sheetId: 'L7163' });
    expect(printedCodes()).toEqual(['B412', 'B412', 'BREW-2026-0007-A', 'KIT-031', 'KIT-032']);
    const labels = document.querySelectorAll('[data-slot-kind="label"]');
    expect(within(labels[0] as HTMLElement).queryByText('Kitchen 12')).not.toBeNull();
    expect(within(labels[2] as HTMLElement).queryByText(/Espresso/)).toBeNull();
  });

  it('changes copies per kind', () => {
    renderPage({ subjects: kitchen12WithContents, sheetId: 'L7163' });
    fireEvent.mouseDown(
      within(screen.getByRole('tablist', { name: 'Copies per box' })).getByRole('tab', {
        name: '1',
      })
    );
    fireEvent.mouseDown(
      within(screen.getByRole('tablist', { name: 'Copies per item' })).getByRole('tab', {
        name: '3',
      })
    );
    expect(screen.getByRole('button', { name: 'Print 10 labels' })).toBeTruthy();
  });

  it('forces one choice on everything when asked', () => {
    renderPage({
      subjects: kitchen12WithContents,
      sheetId: 'L7163',
      content: { kind: 'parts', parts: ['qr', 'code'], fields: [] },
    });
    const labels = document.querySelectorAll('[data-slot-kind="label"]');
    expect(within(labels[0] as HTMLElement).queryByText('Kitchen 12')).toBeNull();
  });

  it('lays a long job over as many sheets as it needs', () => {
    renderPage({ subjects: office04WithContents, sheetId: 'L7163', startAt: 7 });
    expect(screen.getByLabelText('Sheet 3 of 3')).toBeTruthy();
    expect(screen.getByText('26 labels on 3 sheets, from label 7')).toBeTruthy();
  });

  it('starts the job at the label chosen on the first sheet', () => {
    renderPage({ ...boxes, copies: { container: 1, item: 1 } });
    expect(screen.getByText('6 labels on 1 sheet, labels 1–6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start at label 18' }));
    expect(screen.getByText('6 labels on 2 sheets, from label 18')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot-kind="used"]')).toHaveLength(17);
  });

  it('cannot print an empty job', () => {
    renderPage({ ...boxes, subjects: [] });
    expect(screen.getByRole('button', { name: 'Print labels' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Nothing to print')).toBeTruthy();
  });

  it('moves the start only when the person says the sheet printed', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(boxes);
    fireEvent.click(screen.getByRole('button', { name: 'Print 12 labels' }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, next starts at 13' }));
    expect(screen.getByText('Next print starts at label 13.')).toBeTruthy();
  });

  it('leaves the start alone when printing was cancelled', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(boxes);
    fireEvent.click(screen.getByRole('button', { name: 'Print 12 labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.getByText('Nothing printed. The sheet still starts at label 1.')).toBeTruthy();
  });
});

describe('items without a code', () => {
  it('will not print until every item has a code', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage({ subjects: kitchen12Uncoded, sheetId: 'L7163' });
    const button = screen.getByRole('button', { name: 'Print 5 labels' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText('2 items need a code before printing.')).toBeTruthy();
    expect(screen.getAllByText('Needs a code')).toHaveLength(2);
  });

  it('will not print again from the cancelled notice while a code is missing', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage({ subjects: kitchen12Uncoded, sheetId: 'L7163', outcome: 'cancelled' });
    fireEvent.click(screen.getByRole('button', { name: 'Print again' }));
    expect(print).not.toHaveBeenCalled();
  });

  it('takes a suggested code in one tap', () => {
    renderPage({ subjects: kitchen12Uncoded, sheetId: 'L7163' });
    fireEvent.click(screen.getByRole('button', { name: 'Add KIT-031' }));
    expect(screen.getByText('1 item needs a code before printing.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add code' }));
    expect(screen.queryByText(/needs? a code/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Print 5 labels' })).toHaveProperty(
      'disabled',
      false
    );
  });

  it('refuses a typed code another item holds and offers the next free one', () => {
    const cups = kitchen12Uncoded[2];
    render(
      <PrintLabelsPage
        seed={{ subjects: kitchen12Uncoded, sheetId: 'L7163' }}
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
    expect(screen.getByText('1 item needs a code before printing.')).toBeTruthy();
  });
});

describe('sheets', () => {
  it('lists every preset and the custom sheet', () => {
    renderPage(boxes);
    const options = [...screen.getByLabelText('Sheet').querySelectorAll('option')].map(
      (option) => option.value
    );
    expect(options).toEqual([
      'L7159',
      'L7160',
      'L7161',
      'L7162',
      'L7163',
      'L7173',
      'L7165',
      'L7166',
      'L7169',
      'L7168',
      'L7167',
      'custom',
    ]);
  });

  it('switches preset and re-lays the job', () => {
    renderPage(boxes);
    fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: 'L7165' } });
    expect(screen.getByText('12 labels on 2 sheets, from label 1')).toBeTruthy();
  });

  it('measures a custom sheet once and remembers it in this browser', () => {
    renderPage(boxes);
    fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: 'custom' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Labels down'), { target: { value: '8' } });
    fireEvent.change(within(dialog).getByLabelText('Label height'), { target: { value: '33.9' } });
    fireEvent.change(within(dialog).getByLabelText('Top margin'), { target: { value: '12.9' } });
    fireEvent.change(within(dialog).getByLabelText('Down pitch'), { target: { value: '33.9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use this sheet' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Sheet')).toHaveProperty('value', 'custom');
    expect(JSON.parse(window.localStorage.getItem(CUSTOM_SHEET_STORAGE_KEY) ?? '{}')).toMatchObject(
      {
        columns: 3,
        rows: 8,
        labelHeightMm: 33.9,
      }
    );
    cleanup();
    renderPage({ ...boxes, sheetId: 'custom' });
    expect(screen.getByText('Custom · 24 per sheet, 63.5 × 33.9 mm')).toBeTruthy();
  });

  it('will not save a custom sheet that runs off the page', () => {
    renderPage(boxes);
    fireEvent.change(screen.getByLabelText('Sheet'), { target: { value: 'custom' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Labels down'), { target: { value: '9' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('off the bottom edge');
    expect(within(dialog).getByRole('button', { name: 'Use this sheet' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('steps a box label down to QR and code on labels too narrow for its name, and says why', () => {
    renderPage({
      subjects: kitchen12WithContents,
      sheetId: 'custom',
      customSheet: {
        columns: 5,
        rows: 9,
        labelWidthMm: 38,
        labelHeightMm: 30,
        marginTopMm: 13.5,
        marginLeftMm: 6,
        pitchXMm: 40,
        pitchYMm: 30,
      },
    });
    expect(screen.getByText(/leaves too little room beside it, so 2 labels print/)).toBeTruthy();
    expect(printedCodes()).toEqual(['B412', 'B412', 'BREW-2026-0007-A', 'KIT-031', 'KIT-032']);
    expect(screen.queryByText('Kitchen 12', { selector: '[data-slot-kind] *' })).toBeNull();
  });

  it('prints nothing on labels too small for a QR, and says why', () => {
    renderPage({
      subjects: printBoxes,
      sheetId: 'custom',
      customSheet: {
        columns: 5,
        rows: 13,
        labelWidthMm: 38.1,
        labelHeightMm: 21.2,
        marginTopMm: 10.7,
        marginLeftMm: 4.75,
        pitchXMm: 40.64,
        pitchYMm: 21.2,
      },
    });
    expect(screen.getByRole('alert').textContent).toContain('20.5 mm');
    expect(screen.getByRole('button', { name: 'Print labels' })).toHaveProperty('disabled', true);
  });

  it('prints a label without the QR on labels too small for one', () => {
    renderPage({
      subjects: printBoxes,
      content: { kind: 'parts', parts: ['code'], fields: [] },
      sheetId: 'custom',
      customSheet: {
        columns: 5,
        rows: 13,
        labelWidthMm: 38.1,
        labelHeightMm: 21.2,
        marginTopMm: 10.7,
        marginLeftMm: 4.75,
        pitchXMm: 40.64,
        pitchYMm: 21.2,
      },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Print 12 labels' })).toHaveProperty(
      'disabled',
      false
    );
  });

  it('prints the code on an item when only contents were chosen, and says so', () => {
    renderPage({
      subjects: kitchen12WithContents,
      sheetId: 'L7163',
      content: { kind: 'parts', parts: ['contents'], fields: [] },
      details: {
        [kitchen12WithContents[0]?.id ?? '']: {
          typeName: 'Moving box',
          fields: [],
          contents: ['Coffee cups ×6'],
        },
      },
    });
    expect(printedCodes()).toEqual(['BREW-2026-0007-A', 'KIT-031', 'KIT-032']);
    expect(screen.getAllByText('Coffee cups ×6')).toHaveLength(2);
    expect(screen.getByText(/3 labels have nothing chosen to show/)).toBeTruthy();
  });

  it('names the choice on the Label shows button, and switches from a preset', () => {
    renderPage({ subjects: printBoxes, sheetId: 'L7160' });
    fireEvent.click(screen.getByRole('button', { name: 'Label shows: Auto' }));
    fireEvent.click(screen.getByRole('button', { name: /^QR only/ }));
    expect(screen.getByRole('button', { name: 'Label shows: QR only' })).toBeTruthy();
    expect(printedCodes()).toEqual([]);
  });
});
