import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { sheetLayout } from '@pops/inventory/labels';

import { FieldList } from './label-template-parts';
import { ContentLabel } from './label-templates';

import type { LabelFieldValue, PrintSubject } from '@pops/inventory/labels';

afterEach(cleanup);

const subject: PrintSubject = {
  id: '8c1e4f2a-5b7d-4a9e-b3c6-000000000001',
  name: 'Books 2',
  code: 'B002',
  suggestedCode: null,
  kind: 'container',
  place: null,
  quantity: 1,
};

function renderField(field: LabelFieldValue) {
  render(
    <ContentLabel
      subject={subject}
      layout={sheetLayout('L7160')}
      label={{ parts: ['qr', 'name'], fields: [field], contents: [], fallback: false }}
    />
  );
  return screen.getByRole('list', { name: 'Fields' });
}

describe('printed field icons', () => {
  it('replaces the prefix with the configured icon and keeps an accessible field name', () => {
    const list = renderField({
      id: 'box.destination',
      label: 'Destination',
      value: 'Office upstairs',
      icon: 'PackageOpenUp',
    });
    expect(screen.getByText('Destination:')).toHaveClass('sr-only');
    expect(list).toHaveTextContent('Office upstairs');
    expect(list.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(list.querySelector('.lucide-package-open')).not.toBeNull();
    expect(list.querySelector('.lucide-arrow-up')).not.toBeNull();
  });

  it.each([undefined, '', 'UnknownIcon', '__proto__'])('falls back to text for icon %s', (icon) => {
    const list = renderField({
      id: 'box.destination',
      label: 'Unpack in',
      value: 'Office',
      ...(icon === undefined ? {} : { icon }),
    });
    expect(screen.getByText('Unpack in:')).not.toHaveClass('sr-only');
    expect(list).toHaveTextContent('Unpack in: Office');
    expect(list.querySelector('svg')).toBeNull();
  });

  it('uses other configured icons without changing the field value', () => {
    const list = renderField({ id: 'box.room', label: 'Room', value: 'Kitchen', icon: 'MapPin' });
    expect(list.querySelector('.lucide-map-pin')).not.toBeNull();
    expect(list).toHaveTextContent('Kitchen');
  });

  it('constrains icon field rows to the height reserved by the header plan', () => {
    render(
      <FieldList
        list={{
          pt: 12,
          shown: [
            { id: 'box.destination', label: 'Unpack in', value: 'Office', icon: 'PackageOpenUp' },
          ],
          more: 2,
        }}
        lineHeight={1.3}
      />
    );

    const list = screen.getByRole('list', { name: 'Fields' });
    expect(list).toHaveClass('min-w-0', 'max-w-full');
    for (const row of within(list).getAllByRole('listitem')) {
      expect(row.getAttribute('style')).toContain('line-height: 1.3');
      expect(row.getAttribute('style')).toContain('height: 1.3em');
      expect(row.getAttribute('style')).toContain('max-height: 1.3em');
      expect(row).toHaveClass('overflow-hidden');
    }
    expect(list.querySelector('span[aria-hidden="true"]')).toHaveClass('align-text-bottom');
  });
});
