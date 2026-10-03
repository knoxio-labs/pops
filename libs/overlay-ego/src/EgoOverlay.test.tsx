import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EgoOverlay } from './EgoOverlay';

vi.mock('./chat-hooks/useChatPageModel', () => ({
  useChatPageModel: () => ({}),
}));

vi.mock('./chat-components/ChatPanel', () => ({
  ChatPanel: () => null,
}));

describe('EgoOverlay', () => {
  it('omits the unavailable Ego settings action and keeps close working', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EgoOverlay open onClose={onClose} />);

    expect(screen.queryByRole('button', { name: 'Open Ego settings' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
