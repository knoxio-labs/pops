import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityAvatar, type AvatarEntity } from './EntityAvatar';

/**
 * Radix's `AvatarImage` only renders once `new window.Image()` reports
 * `load` — jsdom never actually fetches images, so without this stub the
 * `<img>` never appears and every avatar renders its fallback regardless of
 * `avatarAssetId`.
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

function entity(overrides: Partial<AvatarEntity>): AvatarEntity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    avatarAssetId: null,
    colour: null,
    ...overrides,
  };
}

describe('EntityAvatar', () => {
  it('renders the avatar image, resolved from the entity id, when avatarAssetId is set', async () => {
    const { container } = render(<EntityAvatar entity={entity({ avatarAssetId: 'asset-1' })} />);
    const img = await vi.waitUntil(() => container.querySelector('img'));
    expect(img).toHaveAttribute('src', '/contacts-api/entities/ent-1/avatar?v=asset-1');
  });

  it('falls back to initials tinted with the assigned colour when there is no avatar', () => {
    const { container } = render(<EntityAvatar entity={entity({ colour: '#e04667' })} />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    const fallback = screen.getByText('WO');
    expect(fallback).toHaveStyle({ backgroundColor: '#e0466729', color: '#e04667' });
  });

  it('falls back to plain initials when neither an avatar nor a colour is set', () => {
    const { container } = render(<EntityAvatar entity={entity({})} />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    const fallback = screen.getByText('WO');
    expect(fallback.style.backgroundColor).toBe('');
  });

  it('two-word names use the first letter of each word for initials', () => {
    render(<EntityAvatar entity={entity({ name: 'Sarah Chen' })} />);
    expect(screen.getByText('SC')).toBeInTheDocument();
  });
});
