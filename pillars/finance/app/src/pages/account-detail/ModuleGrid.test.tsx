import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DAY_ONE_ACCOUNT_KINDS } from '@pops/finance';

import { ModuleGrid, modulesFor } from './ModuleGrid';

describe('modulesFor', () => {
  it.each(DAY_ONE_ACCOUNT_KINDS)(
    'returns no modules yet for %s (POPS-2807 not started)',
    (kind) => {
      expect(modulesFor(kind)).toEqual([]);
    }
  );
});

describe('ModuleGrid', () => {
  it('renders nothing rather than a placeholder', () => {
    const { container } = render(<ModuleGrid kind="checking" />);
    expect(container).toBeEmptyDOMElement();
  });
});
