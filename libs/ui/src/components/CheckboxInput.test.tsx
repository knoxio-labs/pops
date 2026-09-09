import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CheckboxInput } from './CheckboxInput';

function idOf(markup: string) {
  return /id="([^"]+)"/.exec(markup)?.[1];
}

describe('CheckboxInput — generated id', () => {
  it('keeps the same id across re-renders', () => {
    const { rerender } = render(<CheckboxInput label="Subscribe" />);
    const before = screen.getByRole('checkbox').id;

    rerender(<CheckboxInput label="Subscribe to the newsletter" />);

    expect(screen.getByRole('checkbox').id).toBe(before);
  });

  it('produces the same id for two independent renders of the same tree', () => {
    const first = idOf(renderToString(<CheckboxInput label="Subscribe" />));
    const second = idOf(renderToString(<CheckboxInput label="Subscribe" />));

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it('links the label to the control it labels', () => {
    render(<CheckboxInput label="Subscribe" />);

    expect(screen.getByText('Subscribe')).toHaveAttribute('for', screen.getByRole('checkbox').id);
  });

  it('prefers an explicit id over the generated one', () => {
    render(<CheckboxInput id="newsletter" label="Subscribe" />);

    expect(screen.getByRole('checkbox')).toHaveAttribute('id', 'newsletter');
  });
});

describe('CheckboxInput — attribute pass-through', () => {
  it('forwards standard control attributes to the DOM', () => {
    render(<CheckboxInput label="Subscribe" data-testid="newsletter" title="Weekly digest" />);

    const control = screen.getByTestId('newsletter');
    expect(control).toBe(screen.getByRole('checkbox'));
    expect(control).toHaveAttribute('title', 'Weekly digest');
  });
});
