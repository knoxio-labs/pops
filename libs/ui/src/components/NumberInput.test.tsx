import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NumberInput } from './NumberInput';

describe('NumberInput — empty/unset state', () => {
  it('renders blank when neither value nor defaultValue is given', () => {
    render(<NumberInput placeholder="amount" />);
    const input = screen.getByPlaceholderText('amount') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders blank for an explicitly empty uncontrolled defaultValue', () => {
    render(<NumberInput placeholder="amount" defaultValue="" />);
    const input = screen.getByPlaceholderText('amount') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders blank for an explicitly empty controlled value, not "0"', () => {
    render(<NumberInput placeholder="amount" value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('amount') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders "0" only when 0 is actually the value — distinct from unset', () => {
    render(<NumberInput placeholder="amount" defaultValue={0} />);
    const input = screen.getByPlaceholderText('amount') as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  it('disables the stepper buttons while unset', () => {
    render(<NumberInput placeholder="amount" />);
    const [decrement, increment] = screen.getAllByRole('button');
    expect(decrement).toBeDisabled();
    expect(increment).toBeDisabled();
  });

  it('enables the stepper buttons once a value is typed', async () => {
    const user = userEvent.setup();
    render(<NumberInput placeholder="amount" />);
    const input = screen.getByPlaceholderText('amount');
    await user.type(input, '5');
    const [decrement, increment] = screen.getAllByRole('button');
    expect(decrement).toBeEnabled();
    expect(increment).toBeEnabled();
  });

  it('clearing the input back to empty fires onChange with an empty value and re-blanks the stepper', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput placeholder="amount" defaultValue={5} onChange={onChange} />);
    const input = screen.getByPlaceholderText('amount') as HTMLInputElement;
    expect(input.value).toBe('5');

    await user.clear(input);

    expect(input.value).toBe('');
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall?.[0].target.value).toBe('');

    const [decrement, increment] = screen.getAllByRole('button');
    expect(decrement).toBeDisabled();
    expect(increment).toBeDisabled();
  });

  it('does not start a drag gesture while the value is unset', () => {
    render(<NumberInput placeholder="amount" />);
    const input = screen.getByPlaceholderText('amount');
    const box = input.closest('div');
    if (!box) throw new Error('NumberInput container not found');

    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }));

    expect((screen.getByPlaceholderText('amount') as HTMLInputElement).value).toBe('');
  });
});

describe('NumberInput — react-hook-form-style controlled round trip', () => {
  /**
   * Mirrors how `register()` + `reset()` drive a controlled field: the form
   * owns the value in state (starting unset, as an optional numeric field
   * would with `defaultValues: { price: '' }`) and NumberInput is driven
   * purely through `value`/`onChange`, same as any other controlled input.
   */
  function RhfLikeHarness({ resetTo }: { resetTo?: number }) {
    const [price, setPrice] = useState<number | ''>('');
    return (
      <div>
        <NumberInput
          placeholder="price"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value === '' ? '' : Number(e.target.value));
          }}
        />
        <button type="button" onClick={() => setPrice(resetTo ?? '')}>
          reset
        </button>
      </div>
    );
  }

  it('renders blank for an unset RHF field, then displays correctly after reset() to a real value', async () => {
    const user = userEvent.setup();
    render(<RhfLikeHarness resetTo={42} />);
    const input = screen.getByPlaceholderText('price') as HTMLInputElement;
    expect(input.value).toBe('');

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(input.value).toBe('42');
  });

  it('round-trips a defined value entered by the user and surfaces it back through onChange', async () => {
    const user = userEvent.setup();
    render(<RhfLikeHarness />);
    const input = screen.getByPlaceholderText('price') as HTMLInputElement;

    await user.type(input, '19');

    expect(input.value).toBe('19');
  });
});

/**
 * Every change this component emits must carry the element, not just a value.
 *
 * `e.currentTarget.value` is the shape React's own types encourage, and it was
 * the one shape `NumberInput` could not deliver: the clear path and the
 * steppers each built `{ target: { value } }` and cast it to a
 * `ChangeEvent`, so a consumer reading `currentTarget` read `undefined.value`
 * and threw exactly when the user emptied the field (POPS-3296). Reading
 * `currentTarget` here rather than `target` is the whole point — swap it for
 * `target` and these pass against the unfixed component.
 */
describe('NumberInput — the event a consumer receives', () => {
  function currentTargetHarness() {
    const seen: (string | undefined)[] = [];
    render(
      <NumberInput
        placeholder="amount"
        defaultValue={5}
        onChange={(e) => seen.push(e.currentTarget.value)}
      />
    );
    return { seen, input: screen.getByPlaceholderText('amount') as HTMLInputElement };
  }

  it('hands the input element to onChange when the field is cleared', async () => {
    const user = userEvent.setup();
    const { seen, input } = currentTargetHarness();

    await user.clear(input);

    expect(seen.at(-1)).toBe('');
  });

  it('hands the input element to onChange when a stepper is clicked', async () => {
    const user = userEvent.setup();
    const { seen } = currentTargetHarness();

    await user.click(screen.getAllByRole('button')[1] as HTMLElement);

    expect(seen.at(-1)).toBe('6');
  });

  it('hands the input element to onChange when the value is dragged', () => {
    const seen: (string | undefined)[] = [];
    render(
      <NumberInput
        placeholder="amount"
        defaultValue={5}
        onChange={(e) => seen.push(e.currentTarget.value)}
      />
    );
    const box = (screen.getByPlaceholderText('amount') as HTMLInputElement).closest('div');
    if (box === null) throw new Error('NumberInput container not found');

    act(() => {
      box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 96 }));
    });

    expect(seen.at(-1)).toBe('7');
  });
});
