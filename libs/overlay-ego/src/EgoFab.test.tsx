import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EgoFab } from './EgoFab';

describe('EgoFab', () => {
  it('uses a chat icon instead of a sparkle icon', () => {
    render(<EgoFab open={false} onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Open chat' });

    expect(button.querySelector('svg.lucide-message-square')).not.toBeNull();
    expect(button.querySelector('svg.lucide-sparkles')).toBeNull();
  });
});
