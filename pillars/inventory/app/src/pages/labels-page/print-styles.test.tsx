import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LabelPrintStyles } from './print-styles';

describe('LabelPrintStyles', () => {
  it('collapses print ancestors so the A4 sheet is not centered in a responsive grid column', () => {
    const { container } = render(<LabelPrintStyles />);

    expect(container.querySelector('style')?.textContent).toMatch(
      /:has\(\.pops-print-root\)\s*\{[^}]*display: block !important;/s
    );
  });
});
