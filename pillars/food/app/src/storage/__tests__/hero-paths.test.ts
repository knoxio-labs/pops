import { describe, expect, it } from 'vitest';

import {
  HERO_ALLOWED_MIME_TYPES,
  HERO_MIME_TO_EXTENSION,
  assertValidRecipeId,
  heroImageUrl,
  isValidHeroFilename,
  relativeHeroPath,
} from '../hero-paths';

describe('hero-paths', () => {
  describe('assertValidRecipeId', () => {
    it('accepts positive integers', () => {
      expect(assertValidRecipeId(1)).toBe(1);
      expect(assertValidRecipeId(42)).toBe(42);
    });
    it('accepts decimal-string forms', () => {
      expect(assertValidRecipeId('42')).toBe(42);
    });
    it.each([0, -1, 1.5, '0', '-1', '1.5', '../etc/passwd', 'abc', '', null, undefined, {}])(
      'rejects %p',
      (val) => {
        expect(() => assertValidRecipeId(val)).toThrow(/Invalid recipe id/);
      }
    );
  });

  describe('relativeHeroPath', () => {
    it('uses POSIX separators regardless of platform', () => {
      const rel = relativeHeroPath(99, 'png');
      expect(rel).toBe('99/hero.png');
      expect(rel.includes('\\')).toBe(false);
    });
  });

  describe('isValidHeroFilename', () => {
    it.each([
      'hero.jpg',
      'hero.jpeg',
      'hero.png',
      'hero.webp',
      'hero-thumb.webp',
      'hero-card.webp',
    ])('accepts %s', (name) => {
      expect(isValidHeroFilename(name)).toBe(true);
    });
    it.each([
      '',
      'hero',
      'hero.gif',
      'hero.heic',
      '../hero.jpg',
      'hero/../foo.jpg',
      'hero.jpg\0',
      'hero-thumb.jpg',
      'HERO.JPG',
    ])('rejects %s', (name) => {
      expect(isValidHeroFilename(name)).toBe(false);
    });
  });

  describe('heroImageUrl', () => {
    it('returns null for missing input', () => {
      expect(heroImageUrl(null)).toBeNull();
      expect(heroImageUrl(undefined)).toBeNull();
      expect(heroImageUrl('')).toBeNull();
    });
    it('returns null for malformed path', () => {
      expect(heroImageUrl('not-a-path')).toBeNull();
      expect(heroImageUrl('7/hero.gif')).toBeNull();
    });
    it('builds the original URL', () => {
      expect(heroImageUrl('42/hero.jpg', 'original')).toBe('/api/food/recipes/42/hero.jpg');
    });
    it('builds the thumb URL with webp extension', () => {
      expect(heroImageUrl('42/hero.jpg', 'thumb')).toBe('/api/food/recipes/42/hero-thumb.webp');
    });
    it('builds the card URL with webp extension', () => {
      expect(heroImageUrl('42/hero.png', 'card')).toBe('/api/food/recipes/42/hero-card.webp');
    });
  });

  describe('mime mapping', () => {
    it('matches the allowed list', () => {
      expect(Object.keys(HERO_MIME_TO_EXTENSION).toSorted()).toEqual(
        [...HERO_ALLOWED_MIME_TYPES].toSorted()
      );
    });
  });
});
