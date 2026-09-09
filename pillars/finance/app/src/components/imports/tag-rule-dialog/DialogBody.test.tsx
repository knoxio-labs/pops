/**
 * The match-type field used to be a raw `<select>`; this pins it to the kit
 * `Select` so a future edit can't reintroduce one silently. `fireEvent.change`
 * on a native `<select>` and on the kit `Select` behave identically (both are
 * real `<select>` elements under the hood), so this exercises the same path
 * a user driving the dropdown would.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { FormFields } from './DialogBody';

function Harness() {
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [tagsText, setTagsText] = useState('');
  return (
    <FormFields
      pattern={pattern}
      matchType={matchType}
      tagsText={tagsText}
      setPattern={setPattern}
      setMatchType={setMatchType}
      setTagsText={setTagsText}
    />
  );
}

describe('FormFields — match type select', () => {
  it('renders as a real select with all three match-type options', () => {
    render(<Harness />);
    const select = screen.getByLabelText('Match type') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['contains', 'exact', 'regex']);
  });

  it.each(['contains', 'exact', 'regex'] as const)(
    'round-trips %s through the kit select',
    (value) => {
      render(<Harness />);
      const select = screen.getByLabelText('Match type') as HTMLSelectElement;

      fireEvent.change(select, { target: { value } });

      expect(select.value).toBe(value);
    }
  );
});
