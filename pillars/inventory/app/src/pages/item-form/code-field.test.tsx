import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { codeEntry } from './code-assist';
import { CodeField } from './code-field';

describe('CodeField', () => {
  it('uses the QR code icon for deterministic code suggestions', () => {
    render(
      <CodeField
        entry={codeEntry()}
        onType={vi.fn()}
        onSuggest={vi.fn()}
        onAcceptOffered={vi.fn()}
        offline={false}
        nothingToSuggestFrom={false}
      />
    );

    const button = screen.getByRole('button', { name: 'Suggest a code' });
    expect(button.querySelector('svg')).toHaveClass('lucide-qr-code');
    expect(button.querySelector('svg')).not.toHaveClass('lucide-sparkles');
  });
});
