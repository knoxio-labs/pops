import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ColourInput, isValidHexColour } from './ColourInput';

function ControlledHarness({
  initial = '#0ea5e9',
  onChange,
}: {
  initial?: string;
  onChange?: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ColourInput
      label="Colour"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('isValidHexColour', () => {
  it('accepts a 6-digit hex colour, case-insensitively', () => {
    expect(isValidHexColour('#1a2b3c')).toBe(true);
    expect(isValidHexColour('#1A2B3C')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isValidHexColour('not-a-colour')).toBe(false);
    expect(isValidHexColour('#fff')).toBe(false);
    expect(isValidHexColour('')).toBe(false);
    expect(isValidHexColour('#gggggg')).toBe(false);
  });
});

describe('ColourInput — invalid hex', () => {
  it('surfaces an error and does not silently replace the value with #000000', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initial="#ff7a64" />);

    const text = screen.getByRole('textbox', { name: 'Colour' }) as HTMLInputElement;
    await user.clear(text);
    await user.type(text, 'not-a-colour');

    expect(text.value).toBe('not-a-colour');
    expect(screen.getByText(/enter a hex colour/i)).toBeInTheDocument();
    expect(text).toHaveAttribute('aria-invalid', 'true');

    const swatch = screen.getByLabelText('Colour swatch') as HTMLInputElement;
    expect(swatch.value).not.toBe('#000000');
    expect(swatch.value).toBe('#ff7a64');
  });

  it('does not surface a validation error for an empty value', () => {
    render(<ColourInput label="Colour" defaultValue="" />);
    expect(screen.queryByText(/enter a hex colour/i)).toBeNull();
  });

  it('lets an explicit `error` prop override the built-in validation message', () => {
    render(<ColourInput label="Colour" defaultValue="#0ea5e9" error="Colour is required" />);
    expect(screen.getByText('Colour is required')).toBeInTheDocument();
    expect(screen.queryByText(/enter a hex colour/i)).toBeNull();
  });
});

describe('ColourInput — sync between text and swatch', () => {
  it('updates the swatch when a valid hex is typed', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initial="#000000" />);

    const text = screen.getByRole('textbox', { name: 'Colour' }) as HTMLInputElement;
    await user.clear(text);
    await user.type(text, '#1a2b3c');

    const swatch = screen.getByLabelText('Colour swatch') as HTMLInputElement;
    expect(swatch.value).toBe('#1a2b3c');
  });

  it('updates the text field when the swatch changes', () => {
    const onChange = vi.fn();
    render(<ControlledHarness initial="#000000" onChange={onChange} />);

    const swatch = screen.getByLabelText('Colour swatch') as HTMLInputElement;
    fireEvent.change(swatch, { target: { value: '#ff00ff' } });

    expect(onChange).toHaveBeenCalledWith('#ff00ff');
    const text = screen.getByRole('textbox', { name: 'Colour' }) as HTMLInputElement;
    expect(text.value).toBe('#ff00ff');
  });
});

describe('ColourInput — label/id association across re-renders', () => {
  it('keeps a stable generated id/htmlFor pairing across re-renders', () => {
    const { rerender } = render(<ColourInput label="Colour" defaultValue="#0ea5e9" />);
    const input = screen.getByRole('textbox', { name: 'Colour' });
    const firstId = input.id;
    expect(firstId).not.toBe('');

    rerender(<ColourInput label="Colour" defaultValue="#0ea5e9" />);
    const label = screen.getByText('Colour');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', firstId);
    expect(screen.getByRole('textbox', { name: 'Colour' }).id).toBe(firstId);
  });

  it('keeps an explicitly passed id authoritative', () => {
    render(<ColourInput id="institution-colour" label="Colour" defaultValue="#0ea5e9" />);
    const input = screen.getByRole('textbox', { name: 'Colour' });
    expect(input).toHaveAttribute('id', 'institution-colour');
  });
});

describe('ColourInput — controlled vs uncontrolled', () => {
  it('renders uncontrolled with defaultValue and lets the user type freely', async () => {
    const user = userEvent.setup();
    render(<ColourInput label="Colour" defaultValue="#0ea5e9" />);
    const text = screen.getByRole('textbox', { name: 'Colour' }) as HTMLInputElement;
    await user.type(text, '1');
    expect(text.value).toBe('#0ea5e91');
  });

  it('sticks to the controlled value when the parent does not re-render', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColourInput label="Colour" value="#0ea5e9" onChange={onChange} />);
    const text = screen.getByRole('textbox', { name: 'Colour' }) as HTMLInputElement;
    await user.type(text, 'x');
    expect(onChange).toHaveBeenCalled();
    expect(text.value).toBe('#0ea5e9');
  });
});

describe('ColourInput — disabled', () => {
  it('disables both the text field and the swatch', () => {
    render(<ColourInput label="Colour" defaultValue="#0ea5e9" disabled />);
    expect(screen.getByRole('textbox', { name: 'Colour' })).toBeDisabled();
    expect(screen.getByLabelText('Colour swatch')).toBeDisabled();
  });
});
