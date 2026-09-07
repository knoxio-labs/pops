import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Fact } from '../facts.js';

describe('Fact', () => {
  // POPS-3135: a grid item will not shrink below its content, so an
  // unbroken value ran into the next column instead of wrapping.
  it('lets a long unbroken value wrap inside its own column', () => {
    const entityId = 'ent_4B7K2Q9XW3M6VN0PE0000000000000000000000000000000';
    render(<Fact label="Entity" value={entityId} missingLabel="unavailable" />);

    const dd = screen.getByText(entityId);
    expect(dd.className).toContain('break-words');
    expect(dd.parentElement?.className).toContain('min-w-0');
  });
});
