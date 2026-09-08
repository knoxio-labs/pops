import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldLabel, fieldLabelDescribedBy } from './FieldLabel';

describe('FieldLabel — label slot', () => {
  it('renders nothing when no label, error, or description is given', () => {
    const { container } = render(<FieldLabel htmlFor="account-name" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the label text associated with htmlFor', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" />);

    const label = screen.getByText('Account name');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'account-name');
  });
});

describe('FieldLabel — required marker', () => {
  it('does not render a required marker when required is false', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" required={false} />);

    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('does not render a required marker when required is omitted', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" />);

    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders a required marker when required is true', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" required />);

    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

describe('FieldLabel — error slot', () => {
  it('does not render an error paragraph when error is absent', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the error message with an id derived from htmlFor', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" error="Name is required" />);

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Name is required');
    expect(error).toHaveAttribute('id', 'account-name-error');
  });
});

describe('FieldLabel — description slot', () => {
  it('does not render a description when description is absent', () => {
    render(<FieldLabel htmlFor="account-name" label="Account name" />);

    expect(screen.queryByText('Shown on statements.')).not.toBeInTheDocument();
  });

  it('renders the description with an id derived from htmlFor', () => {
    render(
      <FieldLabel htmlFor="account-name" label="Account name" description="Shown on statements." />
    );

    const description = screen.getByText('Shown on statements.');
    expect(description).toHaveAttribute('id', 'account-name-description');
  });

  it('hides the description in favour of the error when both are set', () => {
    render(
      <FieldLabel
        htmlFor="account-name"
        label="Account name"
        description="Shown on statements."
        error="Name is required"
      />
    );

    expect(screen.queryByText('Shown on statements.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });
});

describe('fieldLabelDescribedBy', () => {
  it('returns undefined when neither error nor description is present', () => {
    expect(fieldLabelDescribedBy('account-name', {})).toBeUndefined();
  });

  it('points at the error id for assistive tech when an error is present', () => {
    expect(fieldLabelDescribedBy('account-name', { error: 'Required' })).toBe('account-name-error');
  });

  it('points at the description id when only a description is present', () => {
    expect(fieldLabelDescribedBy('account-name', { description: 'Hint' })).toBe(
      'account-name-description'
    );
  });

  it('prefers the error id over the description id when both are present', () => {
    expect(fieldLabelDescribedBy('account-name', { error: 'Required', description: 'Hint' })).toBe(
      'account-name-error'
    );
  });
});
