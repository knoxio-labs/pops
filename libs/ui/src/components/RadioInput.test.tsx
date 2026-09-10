import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RadioInput } from './RadioInput';

const options = [
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
];

function TwoGroups() {
  return (
    <>
      <RadioInput label="Plan A" options={options} />
      <RadioInput label="Plan B" options={options} />
    </>
  );
}

describe('RadioInput — id scoping', () => {
  it('gives two groups sharing an option value distinct ids', () => {
    render(<TwoGroups />);

    const ids = screen.getAllByRole('radio').map((radio) => radio.getAttribute('id'));

    expect(ids.every((id) => id !== null && id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points each option's label at its own group's radio", async () => {
    const user = userEvent.setup();
    render(<TwoGroups />);

    const radios = screen.getAllByRole('radio');
    const firstFree = radios[0];
    const secondFree = radios[2];
    const secondGroupLabel = screen.getAllByText('Free')[1];
    if (!secondGroupLabel) throw new Error('expected a second group');

    await user.click(secondGroupLabel);

    expect(secondFree).toBeChecked();
    expect(firstFree).not.toBeChecked();
  });
});

/**
 * The two capability gaps that kept three food sites hand-composing
 * `RadioGroup`/`RadioGroupItem` after POPS-3268 removed the id-collision
 * reason (POPS-3298).
 */
describe('RadioInput — option label size', () => {
  function labelFor(text: string): HTMLElement {
    const label = screen.getByText(text);
    if (!(label instanceof HTMLLabelElement)) throw new Error(`'${text}' is not a label`);
    return label;
  }

  it('writes text-sm by default, which is what a parent could not override', () => {
    render(<RadioInput label="Plan" options={options} />);

    expect(labelFor('Free').classList.contains('text-sm')).toBe(true);
  });

  it('writes the smaller scale when asked, and not the default one', () => {
    render(<RadioInput label="Plan" options={options} size="sm" />);

    // Both halves: `text-xs` alongside a surviving `text-sm` would lose in the
    // cascade exactly the way a parent's class did.
    expect(labelFor('Free').classList.contains('text-xs')).toBe(true);
    expect(labelFor('Free').classList.contains('text-sm')).toBe(false);
  });

  it('writes the larger scale too', () => {
    render(<RadioInput label="Plan" options={options} size="lg" />);

    expect(labelFor('Free').classList.contains('text-base')).toBe(true);
  });
});

describe('RadioInput — an option that owns a body', () => {
  const withBodies = [
    { label: 'Existing', value: 'existing', body: <input aria-label="pick one" /> },
    { label: 'New', value: 'new', body: <input aria-label="name it" /> },
  ];

  it('renders the body and keeps it reachable', async () => {
    const user = userEvent.setup();
    render(<RadioInput label="Target" options={withBodies} defaultValue="existing" />);

    await user.type(screen.getByLabelText('name it'), 'Groceries');

    expect(screen.getByLabelText('name it')).toHaveValue('Groceries');
  });

  it('keeps a body mounted when the selection moves off its option', async () => {
    const user = userEvent.setup();
    render(<RadioInput label="Target" options={withBodies} defaultValue="new" />);
    await user.type(screen.getByLabelText('name it'), 'Half typed');

    await user.click(screen.getByRole('radio', { name: 'Existing' }));

    // The whole point of a slot rather than a conditional: clicking away and
    // back must not cost what was typed.
    expect(screen.getByRole('radio', { name: 'Existing' })).toBeChecked();
    expect(screen.getByLabelText('name it')).toHaveValue('Half typed');
  });

  it('associates the body with its own option, not with a sibling', () => {
    render(<RadioInput label="Target" options={withBodies} defaultValue="existing" />);

    const existing = screen.getByRole('radio', { name: 'Existing' });
    const row = existing.closest('div');
    if (row === null) throw new Error('no option row');

    expect(row.contains(screen.getByLabelText('pick one'))).toBe(true);
    expect(row.contains(screen.getByLabelText('name it'))).toBe(false);
  });

  it('adds nothing to an option that declares no body', () => {
    const { container } = render(
      <RadioInput
        label="Plan"
        options={[{ label: 'Free', value: 'free', description: 'Basic features' }]}
      />
    );

    // The label column holds what it always held — the label and the
    // description — and no slot wrapper. An unconditional empty `<div>` would
    // still pass a "the body is absent" assertion while changing the spacing
    // of every existing group in the repo.
    const column = screen.getByText('Free').parentElement;
    expect(column?.children).toHaveLength(2);
    expect(container.querySelectorAll('div.mt-2')).toHaveLength(0);
  });
});

describe('RadioInput — naming the group', () => {
  it('carries an aria-label through to the radiogroup', () => {
    render(<RadioInput aria-label="Endpoint kind" options={options} />);

    expect(screen.getByRole('radiogroup', { name: 'Endpoint kind' })).toBeInTheDocument();
  });

  it('carries an aria-labelledby too', () => {
    render(
      <>
        <span id="kind-heading">Endpoint kind</span>
        <RadioInput aria-labelledby="kind-heading" options={options} />
      </>
    );

    expect(screen.getByRole('radiogroup', { name: 'Endpoint kind' })).toBeInTheDocument();
  });
});
