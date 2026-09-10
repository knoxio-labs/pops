import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateInput, DateTimeInput, TimeInput } from './DateTimeInput';
import { FieldLabel } from './FieldLabel';
import { TextInput } from './TextInput';

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

/**
 * Where the message renders, which is the whole of POPS-3247.
 *
 * These inputs took an `error` and rendered only `aria-invalid` and the
 * destructive border with it — the docstring told callers to "pair it with
 * `FieldLabel`'s error slot", and that slot sits inside the label block, above
 * the control, while every other kit input renders its message below. So a
 * form with a `TextInput` field beside a `DateInput` field showed one message
 * under its control and the other over it, in the same row, in shipping
 * product code.
 *
 * Asserted on DOM order rather than on a class name: a class assertion passes
 * for a message rendered anywhere at all, which is the state it replaces.
 */

/** True when `first` comes before `second` in document order. */
function precedes(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe.each([
  ['DateInput', DateInput],
  ['TimeInput', TimeInput],
  ['DateTimeInput', DateTimeInput],
] as const)('%s error placement', (_name, Control) => {
  it('renders its error message after the control, not before it', () => {
    render(<Control id="when" error="Pick a date" />);

    const message = screen.getByRole('alert');
    const input = message.ownerDocument.getElementById('when');
    expect(input).not.toBeNull();
    expect(precedes(input as Node, message)).toBe(true);
  });

  it('announces the message and gives it the id an aria-describedby can name', () => {
    render(<Control id="when" error="Pick a date" />);

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Pick a date');
    expect(message).toHaveAttribute('id', 'when-error');
  });

  it('renders nothing at all without an error, so no line is reserved for one', () => {
    render(<Control id="when" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the id a caller gave it, which its label points at', () => {
    // The wrapper this needed must not swallow the id: a `FieldLabel htmlFor`
    // that no longer resolves is a label for nothing.
    render(
      <>
        <FieldLabel htmlFor="when" label="When" />
        <Control id="when" error="Pick a date" />
      </>
    );

    expect(screen.getByLabelText('When')).toHaveAttribute('id', 'when');
  });
});

describe('a date field and a text field in one form', () => {
  it('put their messages on the same side of their controls', () => {
    // The defect as a person saw it: two fields side by side, one message
    // above its control and one below.
    render(
      <>
        <DateInput id="date" error="Pick a date" />
        <TextInput id="amount" label="Amount" error="Enter an amount" />
      </>
    );

    const [dateMessage, amountMessage] = screen.getAllByRole('alert');
    const dom = screen.getByLabelText('Amount').ownerDocument;

    expect(precedes(dom.getElementById('date') as Node, dateMessage as Node)).toBe(true);
    expect(precedes(dom.getElementById('amount') as Node, amountMessage as Node)).toBe(true);
  });
});
