import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from './Chip';

describe('Chip — remove button touch target', () => {
  it('expands the tappable area via a before:-inset pseudo-element rather than growing the button', () => {
    render(
      <Chip removable onRemove={() => {}}>
        tag
      </Chip>
    );
    const button = screen.getByRole('button', { name: 'Remove' });

    // The visual affordance stays compact — p-0.5 around a 14px icon — while
    // the tappable area is expanded invisibly, matching the pattern Checkbox/
    // RadioGroupItem/Switch already use for their compact controls.
    expect(button.className).toContain('p-0.5');
    expect(button.className).toContain('relative');
    expect(button.className).toContain('before:absolute');
    expect(button.className).toContain("before:content-['']");
    expect(button.className).toContain('before:-inset-3.5');
  });

  it('does not enlarge the chip itself — size classes stay unchanged', () => {
    render(
      <Chip removable size="default" onRemove={() => {}}>
        tag
      </Chip>
    );
    const chip = screen.getByText('tag').parentElement;
    expect(chip?.className).toContain('px-3');
    expect(chip?.className).toContain('py-1');
    expect(chip?.className).not.toContain('h-11');
    expect(chip?.className).not.toContain('size-11');
  });

  it('calls onRemove and stops the click from bubbling to an ancestor listener', async () => {
    const onRemove = vi.fn();
    const onAncestorClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Chip removable onRemove={onRemove}>
        tag
      </Chip>
    );
    // Attached to `document.body` — an ancestor OUTSIDE the RTL render
    // container, where React's own delegated root listener also lives. A
    // listener on the container itself would fire regardless of
    // stopPropagation, since it shares a node with React's root listener.
    document.body.addEventListener('click', onAncestorClick);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    document.body.removeEventListener('click', onAncestorClick);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });

  it('uses a custom removeLabel for the accessible name', () => {
    render(
      <Chip removable removeLabel="Remove tag: urgent" onRemove={() => {}}>
        urgent
      </Chip>
    );
    expect(screen.getByRole('button', { name: 'Remove tag: urgent' })).toBeInTheDocument();
  });

  it('renders no remove button when not removable', () => {
    render(<Chip>tag</Chip>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
