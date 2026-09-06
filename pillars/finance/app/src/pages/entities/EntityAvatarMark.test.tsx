/**
 * The fallback chain matters here: an entity with an avatar shows it, an
 * entity with only a colour shows initials tinted with it, and an entity
 * with neither (a legacy entity predating POPS-3061, or one whose colour is
 * still `null`) falls back to plain untinted initials. Each assertion is
 * scoped narrowly enough that it fails if any one branch regresses into
 * another.
 *
 * Radix's `AvatarImage` only renders once its own `useImageLoadingStatus`
 * probe reports "loaded" — a real `<img>` load event jsdom never fires. The
 * `Image` global is stubbed to report an already-loaded image synchronously
 * so the avatar-present branch is actually exercised rather than always
 * falling through to the fallback.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityAvatarMark } from './EntityAvatarMark';

class InstantlyLoadedImage {
  complete = true;
  naturalWidth = 1;
  crossOrigin: string | null = null;
  referrerPolicy = '';
  set src(_value: string) {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

beforeEach(() => {
  vi.stubGlobal('Image', InstantlyLoadedImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EntityAvatarMark — fallback chain', () => {
  it('renders the uploaded avatar image when a URL is given', () => {
    const { container } = render(
      <EntityAvatarMark
        name="Woolworths"
        avatarUrl="/contacts-api/entities/e1/avatar?v=blob-1"
        colour="#e04667"
      />
    );
    // The `<img>` carries `alt=""` (a decorative mark, not content), which
    // strips it of the accessible `img` role — so it's queried directly
    // rather than through `getByRole`.
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/contacts-api/entities/e1/avatar?v=blob-1');
    expect(screen.queryByText('WO')).toBeNull();
  });

  it('renders initials tinted with the assigned colour when there is no avatar', () => {
    const { container } = render(
      <EntityAvatarMark name="Sarah Chen" avatarUrl={undefined} colour="#8e57d8" />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('SC')).toHaveStyle({
      backgroundColor: '#8e57d829',
      color: '#8e57d8',
    });
  });

  it('renders plain untinted initials when there is neither an avatar nor a colour', () => {
    const { container } = render(
      <EntityAvatarMark name="Unlabelled Merchant Pty Ltd" avatarUrl={undefined} colour={null} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('UM').getAttribute('style')).toBeFalsy();
  });
});
