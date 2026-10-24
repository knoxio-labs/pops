import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Comparison } from './Comparison';
import { emptyChoices, type ReviewItem } from './model';

const item: ReviewItem = {
  id: 'incoming',
  proposalRevision: 'proposal-incoming',
  candidateTotal: 3,
  candidateOffset: 0,
  candidateLimit: 50,
  name: 'Incoming Alex',
  source: 'Google CSV',
  points: [{ kind: 'email', value: 'incoming@example.test' }],
  status: 'Review required',
  errors: [],
  processed: false,
  candidates: ['First Alex', 'Second Alex', 'Third Alex'].map((name, index) => ({
    id: String(index),
    entityId: String(index),
    localName: name,
    sourceOptions: [],
    name,
    points: [{ id: `point-${index}`, kind: 'email', value: `alex${index}@example.test` }],
    sources: ['iCloud'],
    reasons: ['Exact full name'],
    keepSeparate: index === 2,
  })),
};

function Review() {
  const [choices, setChoices] = useState(emptyChoices);
  return <Comparison item={item} choices={choices} onChange={setChoices} disabled={false} />;
}

describe('focused comparison', () => {
  it('independently selects a subset and remembers an exclusion without selecting the remainder', async () => {
    const user = userEvent.setup();
    render(<Review />);
    const first = within(screen.getByRole('region', { name: 'Existing First Alex' }));
    const second = within(screen.getByRole('region', { name: 'Existing Second Alex' }));
    await user.click(first.getByRole('checkbox'));
    await user.click(second.getByRole('button', { name: 'Different person' }));
    expect(first.getByRole('checkbox')).toBeChecked();
    expect(second.getByRole('checkbox')).not.toBeChecked();
    expect(second.getByRole('button', { name: 'Different person' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(first.getByRole('button', { name: 'Review later' }));
    expect(first.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByRole('combobox', { name: 'Display name' })).not.toBeInTheDocument();
  });
  it('blocks merging a remembered different person and presents its source evidence', () => {
    render(<Review />);
    const third = within(screen.getByRole('region', { name: 'Existing Third Alex' }));
    expect(third.getByRole('checkbox')).toBeDisabled();
    expect(third.getByText('email: alex2@example.test')).toBeVisible();
    expect(third.getByText('Different person · remembered')).toBeVisible();
  });
});

function SourceFields() {
  const [choices, setChoices] = useState(emptyChoices);
  const evidence: ReviewItem = {
    ...item,
    candidates: [
      {
        id: 'person',
        entityId: 'person',
        name: 'Projected name',
        localName: 'Original local name',
        sourceOptions: [{ id: 'record', name: 'Latest source name' }],
        profileAvailable: false,
        points: [],
        sources: ['iCloud'],
        reasons: ['Email'],
        keepSeparate: false,
      },
    ],
  };
  return <Comparison item={evidence} choices={choices} onChange={setChoices} disabled={false} />;
}

it('labels raw local and current source values explicitly and clears provenance when deselected', async () => {
  const user = userEvent.setup();
  render(<SourceFields />);
  const candidate = within(screen.getByRole('region', { name: 'Existing Projected name' }));
  await user.click(candidate.getByRole('checkbox'));
  expect(screen.getByRole('option', { name: 'Local · Original local name' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Source · Latest source name' })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Display name' }), 'source:record');
  expect(screen.getByRole('combobox', { name: 'Display name' })).toHaveValue('source:record');
  await user.click(candidate.getByRole('checkbox'));
  await user.click(candidate.getByRole('checkbox'));
  expect(screen.getByRole('combobox', { name: 'Display name' })).toHaveValue('');
});
