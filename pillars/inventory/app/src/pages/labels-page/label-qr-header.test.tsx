import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LABEL_GAP_MM } from '@pops/inventory/labels';

import { QrHeaderLabel } from './label-qr-header';

import type { FittedList, LabelPlan } from '@pops/inventory/labels';

const baseHeader: NonNullable<LabelPlan['header']> = {
  heightMm: 32,
  columns: 2,
  columnGapMm: 3,
  bodyGapMm: 3,
  headingHeightMm: 4.7,
  rows: 3,
};

function renderHeader(
  contents: FittedList<string>,
  header: NonNullable<LabelPlan['header']> = baseHeader
) {
  return render(
    <QrHeaderLabel
      header={header}
      contents={contents}
      qr={<div data-testid="qr">QR</div>}
      name={<p>Books 2</p>}
      code={<p>B002</p>}
      fields={
        <ul aria-label="Fields">
          <li>Office</li>
        </ul>
      }
    />
  );
}

describe('QrHeaderLabel', () => {
  it('uses the planned fixed header and body geometry', () => {
    const { container } = renderHeader({ pt: 8, shown: ['One'], more: 0 });

    const header = container.querySelector<HTMLElement>('[data-label-header]');
    const bodyGap = container.querySelector<HTMLElement>('[data-label-body-gap]');
    const heading = screen.getByRole('heading', { name: 'Contents (1)' });

    if (!header || !bodyGap) throw new Error('header geometry was not rendered');

    expect(header.getAttribute('style')).toContain('height: 32mm');
    expect(header.getAttribute('style')).toContain(`gap: ${LABEL_GAP_MM}mm`);
    expect(within(header).getByTestId('qr')).toBeInTheDocument();
    expect(within(header).getByText('Books 2')).toBeInTheDocument();
    expect(bodyGap).toHaveClass('box-border', 'border-t', 'border-print-rule');
    expect(bodyGap.getAttribute('style')).toContain('height: 3mm');
    expect(heading.getAttribute('style')).toContain('height: 4.7mm');
  });

  it('flows source-order contents down each column before moving right', () => {
    renderHeader({ pt: 8, shown: ['One', 'Two', 'Three', 'Four', 'Five'], more: 1 });

    const list = screen.getByRole('list', { name: 'Contents' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['One', 'Two', 'Three', 'Four', 'Five', '+1 more']);
    const style = list.getAttribute('style') ?? '';
    expect(style).toContain('grid-template-rows: repeat(3, auto)');
    expect(style).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(style).toContain('grid-auto-flow: column');
    expect(style).toContain('column-gap: 3mm');
    expect(style).toContain('line-height: 1.3');
    expect(style).toContain('align-content: start');
  });

  it('uses balanced rows below the maximum row budget', () => {
    renderHeader(
      { pt: 8, shown: ['One', 'Two', 'Three', 'Four'], more: 1 },
      { ...baseHeader, rows: 8 }
    );

    expect(screen.getByRole('list', { name: 'Contents' }).getAttribute('style')).toContain(
      'grid-template-rows: repeat(3, auto)'
    );
  });

  it('renders the planner-selected three-column layout without adding rows', () => {
    renderHeader(
      { pt: 7, shown: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'], more: 1 },
      { ...baseHeader, columns: 3 }
    );

    const list = screen.getByRole('list', { name: 'Contents' });
    expect(list).toHaveAttribute('data-label-columns', '3');
    expect(list.getAttribute('style')).toContain('grid-template-rows: repeat(3, auto)');
    expect(list.getAttribute('style')).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))'
    );
    expect(screen.getByRole('heading', { name: 'Contents (9)' })).toBeInTheDocument();
    expect(list.querySelector('[data-more]')).toHaveTextContent('+1 more');
  });

  it('clips every measured region at its own boundary as a final overflow guard', () => {
    const { container } = renderHeader({ pt: 8, shown: ['One', 'Two'], more: 20 });

    expect(container.querySelector('[data-label-qr-header]')).toHaveClass('overflow-hidden');
    expect(container.querySelector('[data-label-header]')).toHaveClass('overflow-hidden');
    expect(container.querySelector('[data-label-header-text]')).toHaveClass('overflow-hidden');
    expect(screen.getByRole('heading', { name: 'Contents (22)' })).toHaveClass('overflow-hidden');
    expect(screen.getByRole('list', { name: 'Contents' })).toHaveClass('overflow-hidden');
  });
});
