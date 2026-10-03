import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Command, CommandInput } from './command';

describe('CommandInput touch typography', () => {
  it('keeps its input at 16px before desktop sizing', () => {
    render(
      <Command>
        <CommandInput aria-label="Search" />
      </Command>
    );
    expect(screen.getByRole('combobox')).toHaveClass('text-base', 'md:text-sm');
  });
});
