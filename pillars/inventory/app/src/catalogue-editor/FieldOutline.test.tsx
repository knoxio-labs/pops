import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldOutline } from './FieldOutline';
import { testField, testType } from './type-tree-test-utils';

const parent = testType('bedding', 'Bedding', null, {
  fields: [testField('material', 'bedding', 'material', { label: 'Material', sortOrder: 0 })],
});
const child = testType('sheet', 'Sheet', 'bedding', {
  fields: [testField('size', 'sheet', 'size', { label: 'Size', sortOrder: 0 })],
});

describe('FieldOutline inherited fields', () => {
  it('groups inherited fields as read-only and links back to their owner', () => {
    const onSelectType = vi.fn();
    render(
      <FieldOutline
        fields={child.fields}
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onSelect={vi.fn()}
        onSelectType={onSelectType}
        selectedId={null}
        type={child}
        types={[parent, child]}
      />
    );

    const inherited = screen.getByRole('region', { name: 'From Bedding' });
    expect(inherited).toHaveTextContent('Material');
    expect(inherited).toHaveTextContent('Read-only');
    expect(screen.getByRole('heading', { name: 'Sheet fields' })).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Material/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit on Bedding' }));

    expect(onSelectType).toHaveBeenCalledWith('bedding');
  });
});
