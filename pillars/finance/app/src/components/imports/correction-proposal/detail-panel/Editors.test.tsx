/**
 * An `edit` op's data is a patch over the target rule, and for a long time the
 * editor only exposed the outcome fields — so "Edit" on a rule could not touch
 * the two fields that decide what the rule matches. These tests pin the pattern
 * fields to the patch semantics: they render the rule's own values until the
 * patch carries one, and what they write is the patch.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../../store/importStore';
import { EditDataEditor, type EditBaseline } from './Editors';

import type { EditRuleData } from '../types';

const mockEntitiesLookup = vi.fn();

vi.mock('../../../../contacts-api/index.js', () => ({
  entitiesLookup: () => mockEntitiesLookup(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const baseline: EditBaseline = {
  entityId: 'ent-1',
  entityName: 'Entity One',
  descriptionPattern: 'SOME PATTERN',
  matchType: 'contains',
};

function Harness(props: { baseline?: EditBaseline; onData: (d: EditRuleData) => void }) {
  const [data, setData] = useState<EditRuleData>({});
  return (
    <EditDataEditor
      data={data}
      onChange={(next) => {
        setData(next);
        props.onData(next);
      }}
      disabled={false}
      baseline={props.baseline}
    />
  );
}

async function renderEditor(withBaseline = true) {
  const onData = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness baseline={withBaseline ? baseline : undefined} onData={onData} />
    </QueryClientProvider>
  );
  await waitFor(() => expect(mockEntitiesLookup).toHaveBeenCalled());
  return onData;
}

function lastData(onData: ReturnType<typeof vi.fn>): EditRuleData {
  return onData.mock.calls.at(-1)?.[0] as EditRuleData;
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
  mockEntitiesLookup.mockResolvedValue({
    data: { entities: [{ id: 'ent-1', name: 'Entity One', aliases: [] }], fetchedAt: '2026-01-01' },
  });
});

describe('EditDataEditor pattern fields', () => {
  it("renders the target rule's pattern and match type when the patch carries neither", async () => {
    await renderEditor();
    expect(screen.getByLabelText('Description pattern')).toHaveValue('SOME PATTERN');
    expect(screen.getByLabelText('Match type')).toHaveValue('contains');
  });

  it('writes an edited pattern into the patch', async () => {
    const onData = await renderEditor();
    const input = screen.getByLabelText('Description pattern');
    await userEvent.clear(input);
    await userEvent.type(input, 'XX7373');
    expect(lastData(onData).descriptionPattern).toBe('XX7373');
    expect(screen.getByLabelText('Description pattern')).toHaveValue('XX7373');
  });

  it('writes an edited match type into the patch', async () => {
    const onData = await renderEditor();
    await userEvent.selectOptions(screen.getByLabelText('Match type'), 'regex');
    expect(lastData(onData).matchType).toBe('regex');
  });

  it('warns while the pattern is empty rather than silently restoring it', async () => {
    const onData = await renderEditor();
    await userEvent.clear(screen.getByLabelText('Description pattern'));
    expect(lastData(onData).descriptionPattern).toBe('');
    expect(screen.getByLabelText('Description pattern')).toHaveValue('');
    expect(screen.getByText(/needs a description pattern/i)).toBeInTheDocument();
  });

  it('leaves the pattern out of the patch until it is touched', async () => {
    const onData = await renderEditor();
    await userEvent.type(screen.getByLabelText('Location'), 'Sydney');
    expect(lastData(onData).descriptionPattern).toBeUndefined();
    expect(lastData(onData).location).toBe('Sydney');
  });

  it('offers no pattern fields when the target rule is unknown', async () => {
    await renderEditor(false);
    expect(screen.queryByLabelText('Description pattern')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Match type')).not.toBeInTheDocument();
  });
});
