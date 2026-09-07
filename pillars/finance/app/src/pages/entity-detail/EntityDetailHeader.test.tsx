import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityDetailHeader } from './EntityDetailHeader';

import type { Entity } from '../../contacts-api/types.gen.js';

/**
 * Radix's `AvatarImage` only renders once `new window.Image()` reports
 * `load` — jsdom never actually fetches images, so without this stub the
 * `<img>` never appears regardless of `avatarAssetId`. Mirrors
 * `pages/entities/EntityAvatar.test.tsx`.
 */
class StubImage extends EventTarget {
  complete = false;
  naturalWidth = 0;
  crossOrigin: string | null = null;
  set src(_value: string) {
    this.complete = true;
    this.naturalWidth = 1;
    queueMicrotask(() => this.dispatchEvent(new Event('load')));
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', StubImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    aliases: [],
    defaultTags: [],
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EntityDetailHeader — identity fixture matrix', () => {
  it('renders name and type with nothing assigned (avatar, poster, or colour)', () => {
    render(<EntityDetailHeader entity={entity()} onEdit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Woolworths' })).toBeInTheDocument();
    expect(screen.getByText('company')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the avatar image when only avatarAssetId is set (legacy entity, no colour)', async () => {
    const { container } = render(
      <EntityDetailHeader entity={entity({ avatarAssetId: 'asset-1' })} onEdit={vi.fn()} />
    );
    const img = await vi.waitUntil(() => container.querySelector('img'));
    expect(img).toHaveAttribute('src', '/contacts-api/entities/ent-1/avatar?v=asset-1');
  });

  it('renders initials on the colour tint when only colour is set', () => {
    render(<EntityDetailHeader entity={entity({ colour: '#0a7d3c' })} onEdit={vi.fn()} />);
    expect(screen.getByText('WO')).toBeInTheDocument();
  });

  it('fills the banner from the poster asset when posterAssetId is set', () => {
    const { container } = render(
      <EntityDetailHeader entity={entity({ posterAssetId: 'poster-1' })} onEdit={vi.fn()} />
    );
    const banner = container.querySelector('[style*="poster"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('style')).toContain(
      '/contacts-api/entities/ent-1/poster?v=poster-1'
    );
  });

  it('renders aliases as "also known as" when present, and omits the line otherwise', () => {
    const { rerender } = render(
      <EntityDetailHeader entity={entity({ aliases: ['WW Supermarkets'] })} onEdit={vi.fn()} />
    );
    expect(screen.getByText('also known as WW Supermarkets')).toBeInTheDocument();

    rerender(<EntityDetailHeader entity={entity({ aliases: [] })} onEdit={vi.fn()} />);
    expect(screen.queryByText(/also known as/)).not.toBeInTheDocument();
  });

  it('calls onEdit when the Edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<EntityDetailHeader entity={entity()} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /Edit/ }));

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
