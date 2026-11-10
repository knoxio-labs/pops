import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ContactIdentityFields } from './ContactIdentityFields';

it('retains an explicitly selected type absent from refreshed catalogue choices', () => {
  render(
    <ContactIdentityFields
      name="Retained"
      type="retained-custom"
      types={['bank']}
      disabled={false}
      changeName={vi.fn()}
      changeType={vi.fn()}
    />
  );
  expect(screen.getByRole('combobox', { name: 'Contact type' })).toHaveValue('retained-custom');
  expect(screen.getByRole('option', { name: 'retained-custom' })).toBeInTheDocument();
});
