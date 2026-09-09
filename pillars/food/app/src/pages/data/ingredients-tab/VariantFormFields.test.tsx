/**
 * `packageSizeG` is validated only as a positive number, so 12.34 is a legal
 * value. A fixed native `step` makes it `stepMismatch`-invalid, and the
 * dialog submits through a real `<form>`, so the browser would block the
 * submit before any handler ran — a Save button that silently does nothing.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BLANK_VARIANT_FORM } from './variant-form-helpers';
import { VariantFormFields } from './VariantFormFields';

describe('VariantFormFields — decimal precision', () => {
  it('leaves the decimal field free of a native step constraint', () => {
    render(<VariantFormFields mode="create" form={BLANK_VARIANT_FORM} onChange={vi.fn()} />);

    const packageSize = document.getElementById('variant-package');
    expect(packageSize).toHaveAttribute('step', 'any');
  });

  it('accepts a value finer than a tenth without a validity error', () => {
    render(
      <VariantFormFields
        mode="create"
        form={{ ...BLANK_VARIANT_FORM, packageSizeG: '12.34' }}
        onChange={vi.fn()}
      />
    );

    const packageSize = document.getElementById('variant-package');
    expect(packageSize).toBeInstanceOf(HTMLInputElement);
    expect((packageSize as HTMLInputElement).validity.stepMismatch).toBe(false);
  });
});
