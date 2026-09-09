import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateInput, DateTimeInput, TimeInput } from './DateTimeInput';

describe('DateInput', () => {
  it('pins the native picker to en-AU so it does not fall back to a US-locale browser', () => {
    render(<DateInput aria-label="As of" />);
    expect(screen.getByLabelText('As of')).toHaveAttribute('lang', 'en-AU');
  });

  it('lets a caller override the locale rather than always winning', () => {
    render(<DateInput aria-label="As of" lang="fr-FR" />);
    expect(screen.getByLabelText('As of')).toHaveAttribute('lang', 'fr-FR');
  });

  it('marks the field invalid and shows the destructive border when error is set', () => {
    render(<DateInput aria-label="As of" error="Required" />);
    const input = screen.getByLabelText('As of');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.parentElement).toHaveClass('border-destructive');
  });

  it('does not mark the field invalid when no error is set', () => {
    render(<DateInput aria-label="As of" />);
    const input = screen.getByLabelText('As of');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input.parentElement).not.toHaveClass('border-destructive');
  });
});

describe('TimeInput', () => {
  it('also defaults to en-AU', () => {
    render(<TimeInput aria-label="Start" />);
    expect(screen.getByLabelText('Start')).toHaveAttribute('lang', 'en-AU');
  });
});

describe('DateTimeInput', () => {
  it('also defaults to en-AU', () => {
    render(<DateTimeInput aria-label="Scheduled" />);
    expect(screen.getByLabelText('Scheduled')).toHaveAttribute('lang', 'en-AU');
  });
});
