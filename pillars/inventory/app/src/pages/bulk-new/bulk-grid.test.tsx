import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testType } from '../../catalogue-editor/type-tree-test-utils.js';
import { BLANK_DRAFT } from '../../foundation/list-page/paste-parser.js';
import { BulkGridRow } from './bulk-grid.js';

import type { BulkDraft } from '../../foundation/list-page/paste-parser.js';

const mocks = vi.hoisted(() => ({ useCatalogueLookups: vi.fn() }));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));

const types = [
  testType('bedding', 'Bedding', null),
  testType('linen', 'Linen', 'bedding'),
  testType('sheet', 'Sheet', 'linen'),
  testType('cable', 'Cable', null),
];

function draft(overrides: Partial<BulkDraft> = {}): BulkDraft {
  return { ...BLANK_DRAFT, ...overrides };
}

function renderRow(rowDraft: BulkDraft = draft()) {
  const onCell = vi.fn();
  const onPaste = vi.fn(() => false);
  const onEnter = vi.fn();
  mocks.useCatalogueLookups.mockReturnValue({ types });
  render(
    <BulkGridRow
      draft={rowDraft}
      index={0}
      status="unchecked"
      issues={[]}
      onCell={onCell}
      onPaste={onPaste}
      onEnter={onEnter}
    />
  );
  return { onCell, onPaste, onEnter };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BulkGridRow type picker', () => {
  it('expands the type tree and writes a child full path into the draft cell', () => {
    const { onCell } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Type, row 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    const linen = screen.getByRole('treeitem', { name: 'Bedding › Linen' });
    fireEvent.click(within(linen).getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByText('Bedding › Linen › Sheet'));

    expect(onCell).toHaveBeenCalledWith('type', 'Bedding › Linen › Sheet');
  });

  it('searches by the full child path and keeps matching ancestors visible', () => {
    const { onCell } = renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Type, row 1' }));
    fireEvent.change(screen.getByPlaceholderText('Search types'), {
      target: { value: 'sheet' },
    });

    expect(screen.getByRole('treeitem', { name: 'Bedding › Linen' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Bedding › Linen › Sheet' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bedding › Linen › Sheet'));

    expect(onCell).toHaveBeenCalledWith('type', 'Bedding › Linen › Sheet');
  });

  it('clears a selected child through the picker footer', () => {
    const { onCell } = renderRow(draft({ type: 'Bedding › Linen › Sheet' }));

    fireEvent.click(screen.getByRole('button', { name: 'Choose Type, row 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onCell).toHaveBeenCalledWith('type', '');
  });

  it('keeps the legacy flat Type input and paste handlers', () => {
    const { onCell, onPaste } = renderRow();
    const input = screen.getByRole('textbox', { name: 'Type, row 1' });

    fireEvent.change(input, { target: { value: 'Cable' } });
    expect(onCell).toHaveBeenCalledWith('type', 'Cable');

    const paste = createEvent.paste(input, {
      clipboardData: { getData: () => 'Sheet' },
    });
    fireEvent(input, paste);

    expect(onPaste).toHaveBeenCalledWith('Sheet');
    expect(paste.defaultPrevented).toBe(false);
  });

  it('preserves other draft cells while the Type picker is present', () => {
    renderRow(
      draft({
        name: 'Guest fitted sheet',
        type: 'Bedding',
        quantity: '1',
        code: 'SHEET-1',
        where: 'Bedroom',
        note: 'linen',
      })
    );

    expect(screen.getByRole('textbox', { name: 'Name, row 1' })).toHaveValue('Guest fitted sheet');
    expect(screen.getByRole('textbox', { name: 'Qty, row 1' })).toHaveValue('1');
    expect(screen.getByRole('textbox', { name: 'Code, row 1' })).toHaveValue('SHEET-1');
    expect(screen.getByRole('textbox', { name: 'Where, row 1' })).toHaveValue('Bedroom');
    expect(screen.getByRole('textbox', { name: 'Note, row 1' })).toHaveValue('linen');
  });
});
