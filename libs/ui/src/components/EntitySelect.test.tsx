import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EntitySelect, type EntityOption } from './EntitySelect';

const ENTITIES: EntityOption[] = [
  { id: 'e1', name: 'Woolworths', type: 'company' },
  { id: 'e2', name: 'Netflix', type: 'company' },
  { id: 'e3', name: 'Local Cafe', type: 'company', pending: true },
];

async function openPicker() {
  await userEvent.click(screen.getByRole('combobox'));
  return screen.getByPlaceholderText('Search entities...');
}

describe('EntitySelect — selection', () => {
  it('reports both the id and the name of the picked entity', async () => {
    const onChange = vi.fn();
    render(<EntitySelect entities={ENTITIES} onChange={onChange} />);

    await openPicker();
    await userEvent.click(screen.getByText('Netflix'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('e2', 'Netflix');
  });

  it('renders the selected entity name on the trigger', () => {
    render(<EntitySelect entities={ENTITIES} value="e1" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Woolworths');
  });

  it('flags a locally-created entity as pending', async () => {
    render(<EntitySelect entities={ENTITIES} value="e3" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pending');
  });

  it('falls back to the placeholder when the value matches no known entity', () => {
    render(<EntitySelect entities={ENTITIES} value="deleted-entity" placeholder="Choose..." />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose...');
  });

  it('names the trigger from aria-label, which the combobox role needs', () => {
    // A combobox takes no accessible name from its content, so the selected
    // entity name never labels the control.
    render(<EntitySelect entities={ENTITIES} value="e1" aria-label="Entity" />);
    expect(screen.getByRole('combobox', { name: 'Entity' })).toBeInTheDocument();
  });
});

describe('EntitySelect — clear row', () => {
  it('is absent unless onClear is supplied', async () => {
    render(<EntitySelect entities={ENTITIES} value="e1" />);
    await openPicker();
    expect(screen.queryByText('No entity')).not.toBeInTheDocument();
  });

  it('stays reachable while a search term is typed', async () => {
    // cmdk filters rows by their own label, so a term like "wool" would hide the
    // clear row — exactly when the user is searching for what to replace.
    const onClear = vi.fn();
    render(<EntitySelect entities={ENTITIES} value="e1" onClear={onClear} />);

    const search = await openPicker();
    await userEvent.type(search, 'wool');
    await userEvent.click(screen.getByText('No entity'));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('clears the selection when picked', async () => {
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(<EntitySelect entities={ENTITIES} value="e1" onChange={onChange} onClear={onClear} />);

    await openPicker();
    await userEvent.click(screen.getByText('No entity'));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('EntitySelect — create row', () => {
  it('offers the trimmed search term when it matches no entity', async () => {
    const onCreate = vi.fn();
    render(<EntitySelect entities={ENTITIES} onCreate={onCreate} />);

    const search = await openPicker();
    await userEvent.type(search, '  Universal Hotel  ');
    await userEvent.click(screen.getByText('Create “Universal Hotel”'));

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Universal Hotel');
  });

  it('is absent while the search term is empty', async () => {
    render(<EntitySelect entities={ENTITIES} onCreate={vi.fn()} />);
    await openPicker();
    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('is absent when the term already names an entity, regardless of case', async () => {
    render(<EntitySelect entities={ENTITIES} onCreate={vi.fn()} />);

    const search = await openPicker();
    await userEvent.type(search, 'netflix');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('is absent when the term is an ALIAS of an existing entity', async () => {
    const withAlias: EntityOption[] = [
      { id: 'e1', name: "McDonald's", type: 'company', aliases: ['Maccas'] },
    ];
    render(<EntitySelect entities={withAlias} onCreate={vi.fn()} />);

    const search = await openPicker();
    await userEvent.type(search, 'maccas');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('is absent unless onCreate is supplied', async () => {
    render(<EntitySelect entities={ENTITIES} />);

    const search = await openPicker();
    await userEvent.type(search, 'Universal Hotel');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it('drops the search term once the picker closes', async () => {
    const onCreate = vi.fn();
    render(<EntitySelect entities={ENTITIES} onCreate={onCreate} />);

    const search = await openPicker();
    await userEvent.type(search, 'Universal Hotel');
    await userEvent.click(screen.getByText('Create “Universal Hotel”'));

    expect(await openPicker()).toHaveValue('');
  });
});

describe('EntitySelect — searching by alias', () => {
  it('finds an entity by a name it is also known by', async () => {
    const onChange = vi.fn();
    const withAlias: EntityOption[] = [
      { id: 'e1', name: "McDonald's", type: 'company', aliases: ['Maccas'] },
      { id: 'e2', name: 'Coles', type: 'company' },
    ];
    render(<EntitySelect entities={withAlias} onChange={onChange} />);

    const search = await openPicker();
    await userEvent.type(search, 'Maccas');

    const row = screen.getByRole('option', { name: /McDonald/ });
    await userEvent.click(row);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('e1', "McDonald's");
  });
});
