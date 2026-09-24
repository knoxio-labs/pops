import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogueTypes, chooseOption, renderComputedField } from './test-utils';

import type { CatalogueDescriptor, CatalogueField } from '../types';

const mocks = vi.hoisted(() => ({
  webList: vi.fn(),
  typesManagePreviewComputedField: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
  typesManagePreviewComputedField: (...args: unknown[]) =>
    mocks.typesManagePreviewComputedField(...args),
}));

const PRODUCT: Partial<CatalogueField> = {
  allowOverride: true,
  expressionVersion: 1,
  expression: {
    op: 'multiply',
    left: { op: 'read', path: [], fieldId: 'width' },
    right: { op: 'read', path: [], fieldId: 'height' },
  },
};

const DRAFT: CatalogueDescriptor = {
  revision: {
    revision: 7,
    baseRevision: 3,
    status: 'draft',
    minimumProtocol: 2,
    draftVersion: 4,
    created: { actor: { kind: 'web', id: 'owner', label: 'Owner' }, at: '2026-09-24T00:00:00Z' },
    published: null,
    abandoned: null,
  },
  types: catalogueTypes(PRODUCT),
};

function listed(items: readonly { id: string; name: string }[]) {
  return { data: { items, nextCursor: null }, response: new Response() };
}

function answered(result: object, extra: object = {}) {
  return {
    data: {
      baseRevision: 3,
      draftRevision: 7,
      draftVersion: 4,
      typeId: 'box',
      fieldId: 'volume',
      itemId: 'box-1',
      override: null,
      items: [
        { id: 'box-1', name: 'Blue box', typeId: 'box' },
        { id: 'part-1', name: 'Hinge', typeId: 'part' },
      ],
      result: { dependencies: [], traversedItemIds: ['box-1'], ...result },
      ...extra,
    },
    response: new Response(),
  };
}

function failed(status: number, body: object) {
  return { error: body, response: new Response(null, { status }) };
}

function preview(): HTMLElement {
  return screen.getByRole('region', { name: 'Try on an item' });
}

async function pickItem(name = 'Blue box') {
  await chooseOption(within(preview()).getByLabelText('Item to try'), name);
}

beforeEach(() => {
  mocks.webList.mockReset();
  mocks.typesManagePreviewComputedField.mockReset();
  mocks.webList.mockResolvedValue(listed([{ id: 'box-1', name: 'Blue box' }]));
});

describe('try on an item', () => {
  it('asks for a draft before it can calculate', () => {
    renderComputedField({ volume: PRODUCT });

    expect(
      within(preview()).getByText(/Save a change first to start a draft/u)
    ).toBeInTheDocument();
    expect(mocks.typesManagePreviewComputedField).not.toHaveBeenCalled();
  });

  it('says so when the type has no items to calculate against', async () => {
    mocks.webList.mockResolvedValue(listed([]));
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });

    expect(
      await within(preview()).findByText(/There are no Storage box items yet/u)
    ).toBeInTheDocument();
    expect(mocks.webList).toHaveBeenCalledWith({ query: { typeKey: 'box', limit: 50 } });
  });

  it('evaluates the unsaved edit on the picked item and shows the value and its override', async () => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(
      answered(
        {
          state: 'value',
          value: { amount: '300', unit: 'cm³' },
          dependencies: [
            { itemId: 'box-1', fieldId: 'width', revision: 2 },
            { itemId: 'box-1', fieldId: 'height', revision: 2 },
          ],
        },
        { override: { amount: '12', unit: 'cm³' } }
      )
    );
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });

    expect(
      await within(preview()).findByText('Pick an item to calculate this field for it.')
    ).toBeInTheDocument();
    await pickItem();

    expect(await within(preview()).findByText('300 cm³')).toBeInTheDocument();
    expect(within(preview()).getByText('Width × Height')).toBeInTheDocument();
    expect(
      within(preview()).getByText(/shows 12 cm³ today because of an override/u)
    ).toBeInTheDocument();
    expect(within(preview()).getByText('Read 2 values across 1 item')).toBeInTheDocument();
    expect(mocks.typesManagePreviewComputedField).toHaveBeenCalledWith({
      path: { revision: 7 },
      body: {
        baseRevision: 3,
        expectedDraftVersion: 4,
        operations: [
          expect.objectContaining({
            kind: 'put_field',
            id: 'volume',
            expression: PRODUCT.expression,
            allowOverride: true,
          }),
        ],
        typeId: 'box',
        field: { id: 'volume' },
        itemId: 'box-1',
      },
    });
  });

  it('names the missing input and the item it was read on', async () => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(
      answered({
        state: 'unavailable',
        reason: 'missing_dependency',
        missing: [{ fieldId: 'price', itemId: 'part-1', reason: 'missing_dependency' }],
        traversedItemIds: ['box-1', 'part-1'],
      })
    );
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();

    expect(await within(preview()).findByText('Price is empty on Hinge.')).toBeInTheDocument();
    const traversed = within(preview()).getAllByRole('list', { name: 'Items traversed' })[0];
    expect(traversed).toHaveTextContent('Blue boxStorage box');
    expect(traversed).toHaveTextContent('HingePart');
  });

  it('words each missing input by its own reason, not the last one tried', async () => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(
      answered({
        state: 'unavailable',
        reason: 'missing_dependency',
        missing: [
          { fieldId: 'price', itemId: 'part-1', reason: 'reference_deleted' },
          { fieldId: 'price', itemId: 'box-1', reason: 'missing_dependency' },
        ],
        traversedItemIds: ['box-1', 'part-1'],
      })
    );
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();

    expect(
      await within(preview()).findByText('Price on Hinge points at an item that was deleted.')
    ).toBeInTheDocument();
    expect(within(preview()).getByText('Price is empty on Blue box.')).toBeInTheDocument();
  });

  it.each([
    ['division_by_zero', 'It divides by zero.'],
    ['unit_mismatch', 'The calculation failed (unit_mismatch).'],
  ])('phrases the evaluation error %s', async (code, sentence) => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(answered({ state: 'error', code }));
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();

    expect(await within(preview()).findByText('Could not be calculated')).toBeInTheDocument();
    expect(within(preview()).getByText(sentence)).toBeInTheDocument();
  });

  it('offers to try again after the request fails, and recovers', async () => {
    mocks.typesManagePreviewComputedField
      .mockResolvedValueOnce(failed(500, { message: 'down' }))
      .mockResolvedValueOnce(answered({ state: 'value', value: 7 }));
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();

    expect(await within(preview()).findByText('Preview failed')).toBeInTheDocument();
    fireEvent.click(within(preview()).getByRole('button', { name: 'Try again' }));

    expect(await within(preview()).findByText('7')).toBeInTheDocument();
    expect(mocks.typesManagePreviewComputedField).toHaveBeenCalledTimes(2);
  });

  it('flags the node the preview refused and stops until it is fixed', async () => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(
      failed(400, {
        code: 'catalogue_validation_failed',
        message: 'Catalogue validation failed',
        issues: [
          {
            definitionId: 'volume',
            path: 'expression.right',
            code: 'expression_type_mismatch',
            message: 'expected decimal',
          },
        ],
      })
    );
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();

    expect(
      await within(preview()).findByText('Fix the flagged node to try the expression.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('This does not fit here')).toBeInTheDocument();
  });

  it('re-evaluates when the expression changes', async () => {
    mocks.typesManagePreviewComputedField.mockResolvedValue(answered({ state: 'value', value: 1 }));
    renderComputedField({ volume: PRODUCT, environment: { draft: DRAFT } });
    await pickItem();
    await waitFor(() => expect(mocks.typesManagePreviewComputedField).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Wrap in an operation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Negative of' }));

    await waitFor(() => expect(mocks.typesManagePreviewComputedField).toHaveBeenCalledTimes(2));
    const [, second] = mocks.typesManagePreviewComputedField.mock.calls;
    expect(second?.[0]).toMatchObject({
      body: {
        operations: [
          expect.objectContaining({ expression: expect.objectContaining({ op: 'negate' }) }),
        ],
      },
    });
  });

  it('asks to finish every empty slot before calling the route', async () => {
    renderComputedField({ environment: { draft: DRAFT } });

    expect(
      await within(preview()).findByText('Finish every empty slot to try the expression.')
    ).toBeInTheDocument();
    expect(mocks.typesManagePreviewComputedField).not.toHaveBeenCalled();
  });
});
