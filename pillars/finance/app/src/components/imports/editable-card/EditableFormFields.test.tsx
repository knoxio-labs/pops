import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../store/importStore';
import { EditableFormFields } from './EditableFormFields';

import type { ProcessedTransaction } from '@pops/finance';

const accountsList = vi.fn();
const institutionsList = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  institutionsList: (...args: unknown[]) => institutionsList(...args),
}));

function renderFields(editedFields: Partial<ProcessedTransaction>, setEditedFields = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EditableFormFields editedFields={editedFields} setEditedFields={setEditedFields} />
    </QueryClientProvider>
  );
  return { setEditedFields };
}

beforeEach(() => {
  useImportStore.getState().reset();
  vi.clearAllMocks();
  accountsList.mockResolvedValue({
    data: {
      data: [
        { id: 'acc-1', name: 'Everyday', institutionId: null, kind: 'checking', archivedAt: null },
        {
          id: 'acc-2',
          name: 'Emergency Fund',
          institutionId: null,
          kind: 'savings',
          archivedAt: null,
        },
      ],
      pagination: { total: 2, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
});

describe('EditableFormFields AccountField picker branch', () => {
  it('falls back to a free-text input when the import has no account yet', () => {
    renderFields({ account: 'Some Bank' });

    expect(screen.getByLabelText('Account')).toHaveValue('Some Bank');
    expect(screen.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('renders the account picker once the import has a real account, pre-selecting a match by name', async () => {
    useImportStore.getState().setAccount('acc-1', 'Everyday');
    renderFields({ account: 'Everyday' });

    const trigger = await screen.findByRole('combobox', { name: 'Account' });
    expect(trigger).toHaveTextContent('Everyday');
  });

  it('leaves the picker unselected when the row names an account absent from the list', async () => {
    useImportStore.getState().setAccount('acc-1', 'Everyday');
    renderFields({ account: 'Some Unknown Bank' });

    const trigger = await screen.findByRole('combobox', { name: 'Account' });
    expect(trigger).not.toHaveTextContent('Some Unknown Bank');
  });

  it('calls onChange with the picked account name when a selection is made', async () => {
    const user = userEvent.setup();
    useImportStore.getState().setAccount('acc-1', 'Everyday');
    const { setEditedFields } = renderFields({ account: 'Everyday' });

    await user.click(await screen.findByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByText('Emergency Fund'));

    expect(setEditedFields).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'Emergency Fund' })
    );
  });
});
