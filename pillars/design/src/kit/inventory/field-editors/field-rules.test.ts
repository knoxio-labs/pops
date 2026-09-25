import { describe, expect, it } from 'vitest';

import { atomError, fieldError, referenceRefusal } from './field-rules';

import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

import type { FormFieldDef } from './field-model';

function field(kind: CatalogueFieldKind, extras: Partial<FormFieldDef> = {}): FormFieldDef {
  return { id: `f-${kind}`, label: 'Value', kind, cardinality: 'one', ...extras };
}

describe('atomError', () => {
  it('never flags an empty value, on any kind', () => {
    for (const kind of ['integer', 'decimal', 'url', 'date', 'date_time', 'enum'] as const) {
      expect(atomError(field(kind), '  ')).toBeNull();
    }
  });

  it('limits short text to 200 characters and says how long it is', () => {
    expect(atomError(field('short_text'), 'a'.repeat(200))).toBeNull();
    expect(atomError(field('short_text'), 'a'.repeat(201))).toBe(
      'Value allows up to 200 characters. This is 201.'
    );
  });

  it('limits long text to 20,000 characters and keeps surrounding space', () => {
    expect(atomError(field('long_text'), 'a'.repeat(20_000))).toBeNull();
    expect(atomError(field('long_text'), 'a'.repeat(20_001))).toContain('20,000');
  });

  it('takes whole numbers only, within the safe integer range', () => {
    expect(atomError(field('integer'), '-42')).toBeNull();
    expect(atomError(field('integer'), '4.5')).toBe('Value needs a whole number.');
    expect(atomError(field('integer'), '9007199254740991')).toBeNull();
    expect(atomError(field('integer'), '9007199254740992')).toBe('Value is too large to store.');
    expect(atomError(field('integer'), '-9007199254740992')).toBe('Value is too large to store.');
  });

  it('holds decimals to 9 places and 18 digits, ignoring leading zeros', () => {
    expect(atomError(field('decimal'), '12.340')).toBeNull();
    expect(atomError(field('decimal'), '0.123456789')).toBeNull();
    expect(atomError(field('decimal'), '0.1234567891')).toBe(
      'Value allows up to 9 decimal places.'
    );
    expect(atomError(field('decimal'), '123456789.123456789')).toBeNull();
    expect(atomError(field('decimal'), '1234567890.123456789')).toBe(
      'Value allows up to 18 digits.'
    );
    expect(atomError(field('decimal'), '12,5')).toBe('Value needs a number, like 12.50.');
  });

  it('checks a measurement amount by the decimal rule', () => {
    expect(atomError(field('measurement', { unit: 'kg' }), '1.25')).toBeNull();
    expect(atomError(field('measurement', { unit: 'kg' }), '1.25 kg')).toContain('needs a number');
  });

  it('accepts only real calendar dates', () => {
    expect(atomError(field('date'), '2028-02-29')).toBeNull();
    expect(atomError(field('date'), '2027-02-29')).toBe('Value needs a real date.');
    expect(atomError(field('date'), '2027-13-01')).toBe('Value needs a real date.');
  });

  it('needs both a date and a time for date and time', () => {
    expect(atomError(field('date_time'), '2026-09-22T04:05')).toBeNull();
    expect(atomError(field('date_time'), '2026-09-22T04:05:06.123Z')).toBeNull();
    expect(atomError(field('date_time'), '2026-09-22')).toBe('Value needs a date and a time.');
    expect(atomError(field('date_time'), '2026-02-30T10:00')).toBe(
      'Value needs a date and a time.'
    );
  });

  it('takes absolute https addresses only', () => {
    expect(atomError(field('url'), 'https://example.com/manual.pdf')).toBeNull();
    expect(atomError(field('url'), 'http://example.com')).toContain('https://');
    expect(atomError(field('url'), 'example.com')).toContain('https://');
  });

  it('takes an enum option only when the field has it', () => {
    const options = [{ id: 'usb-c', label: 'USB-C' }];
    expect(atomError(field('enum', { options }), 'usb-c')).toBeNull();
    expect(atomError(field('enum', { options }), 'vga')).toBe('Value has no option vga.');
  });

  it('only accepts true or false for yes / no', () => {
    expect(atomError(field('boolean'), 'true')).toBeNull();
    expect(atomError(field('boolean'), 'maybe')).toBe('Value is either yes or no.');
  });
});

describe('fieldError', () => {
  it('reports the first broken value of a many field', () => {
    const ports = field('integer', { cardinality: 'many', label: 'Ports' });
    expect(fieldError(ports, ['2', 'four', '1.5'])).toBe('Ports needs a whole number.');
    expect(fieldError(ports, ['2', '4'])).toBeNull();
  });

  it('refuses two values on a one field', () => {
    expect(fieldError(field('short_text'), ['a', 'b'])).toBe('Value holds one value.');
    expect(fieldError(field('short_text'), ['a', ' '])).toBeNull();
  });

  it('lets a computed field stay empty', () => {
    expect(
      fieldError(field('decimal', { computed: { allowOverride: true, reads: [] } }), [])
    ).toBeNull();
  });
});

describe('referenceRefusal', () => {
  const label = (id: string) => (id === 'type-furniture' ? 'Furniture' : id);

  it('refuses a kind the field does not allow', () => {
    expect(
      referenceRefusal({ kinds: ['item'], typeIds: [] }, { kind: 'location', typeId: null }, label)
    ).toBe('Places are not allowed here');
    expect(
      referenceRefusal({ kinds: ['location'], typeIds: [] }, { kind: 'item', typeId: 'x' }, label)
    ).toBe('Only places');
  });

  it('constrains item types but never locations', () => {
    const targets = { kinds: ['item', 'location'] as const, typeIds: ['type-furniture'] };
    expect(referenceRefusal(targets, { kind: 'location', typeId: null }, label)).toBeNull();
    expect(referenceRefusal(targets, { kind: 'item', typeId: 'type-furniture' }, label)).toBeNull();
    expect(referenceRefusal(targets, { kind: 'item', typeId: 'type-tools' }, label)).toBe(
      'Only Furniture items'
    );
    expect(referenceRefusal(targets, { kind: 'item', typeId: null }, label)).toBe(
      'Only Furniture items'
    );
  });

  it('allows every item type when none is named', () => {
    expect(
      referenceRefusal({ kinds: ['item'], typeIds: [] }, { kind: 'item', typeId: null }, label)
    ).toBeNull();
  });
});
