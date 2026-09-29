import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FIELD_ICON_OPTIONS, FieldIcon, isFieldIconName } from './FieldIcon';

describe('FieldIcon', () => {
  it.each(FIELD_ICON_OPTIONS)('renders $value as decoration', ({ value }) => {
    const { container } = render(<FieldIcon name={value} />);
    const icon = container.firstElementChild;

    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['Unknown', '__proto__', 'constructor', '<script>alert(1)</script>'])(
    'renders nothing for unsupported name %s',
    (name) => {
      const { container } = render(<FieldIcon name={name} />);

      expect(container).toBeEmptyDOMElement();
      expect(isFieldIconName(name)).toBe(false);
    }
  );

  it.each([null, undefined, 7, {}, ['MapPin']])('rejects non-string name %#', (value) => {
    expect(isFieldIconName(value)).toBe(false);
  });

  it('recognises every published option', () => {
    expect(FIELD_ICON_OPTIONS.every((option) => isFieldIconName(option.value))).toBe(true);
  });

  it('defaults to the surrounding font size and accepts numeric or string sizes', () => {
    const { container, rerender } = render(<FieldIcon name="MapPin" />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '1em');
    expect(container.querySelector('svg')).toHaveAttribute('height', '1em');

    rerender(<FieldIcon name="MapPin" size={24} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
    expect(container.querySelector('svg')).toHaveAttribute('height', '24');

    rerender(<FieldIcon name="MapPin" size="8mm" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '8mm');
    expect(container.querySelector('svg')).toHaveAttribute('height', '8mm');
  });

  it('composes the upward-package glyph from Lucide box and arrow geometry', () => {
    const { container } = render(<FieldIcon name="PackageOpenUp" size={32} />);
    const icon = container.firstElementChild;

    expect(icon).toHaveStyle({ width: '32px', height: '32px' });
    expect(icon?.querySelector('.lucide-package-open')).toHaveClass(
      'absolute',
      'bottom-0',
      'left-1/2',
      'size-3/4',
      '-translate-x-1/2'
    );
    expect(icon?.querySelector('.lucide-arrow-up')).toHaveClass(
      'absolute',
      'top-0',
      'left-1/2',
      'size-1/2',
      '-translate-x-1/2'
    );
    expect(icon?.querySelectorAll('path').length).toBeGreaterThan(1);
  });

  it('uses currentColor and forwards the consumer class', () => {
    const { container } = render(<FieldIcon name="Tag" className="text-foreground" />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('stroke', 'currentColor');
    expect(icon).toHaveClass('text-foreground');
  });
});
