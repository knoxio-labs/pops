/**
 * Unit tests for the live hero-image path helpers.
 *
 * These behaviours were covered only by tests over a Node-only duplicate that
 * lived in the browser-bundled app tree, imported by nothing but its own
 * tests. That duplicate is gone. This module is the copy the food image
 * actually runs, and its only coverage was the REST integration suite, which
 * never exercised the traversal defence or the env resolution directly — so
 * the cases moved here rather than being deleted with the dead code.
 */
import { resolve, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  HERO_ALLOWED_MIME_TYPES,
  HERO_MIME_TO_EXTENSION,
  assertValidRecipeId,
  cardAbsPathFor,
  heroAbsPathFor,
  isValidHeroFilename,
  recipeDirFor,
  recipesRootDir,
  relativeHeroPath,
  resolveServablePath,
  thumbAbsPathFor,
} from '../paths.js';

const ORIGINAL_ENV = process.env['FOOD_RECIPES_DIR'];
const TEST_ROOT = '/tmp/pops-test-recipes';

describe('hero-image paths', () => {
  beforeEach(() => {
    delete process.env['FOOD_RECIPES_DIR'];
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env['FOOD_RECIPES_DIR'];
    else process.env['FOOD_RECIPES_DIR'] = ORIGINAL_ENV;
  });

  describe('recipesRootDir', () => {
    it('falls back to a cwd-relative default when the variable is unset', () => {
      // The image sets FOOD_RECIPES_DIR precisely so this branch is never
      // reached in a container, where the cwd is root-owned (POPS-2737).
      expect(recipesRootDir()).toBe(resolve('./data/food/recipes'));
    });
    it('treats an empty variable as unset', () => {
      process.env['FOOD_RECIPES_DIR'] = '';
      expect(recipesRootDir()).toBe(resolve('./data/food/recipes'));
    });
    it('honours an absolute path', () => {
      process.env['FOOD_RECIPES_DIR'] = '/var/pops/recipes';
      expect(recipesRootDir()).toBe('/var/pops/recipes');
    });
    it('re-reads the environment on every call', () => {
      process.env['FOOD_RECIPES_DIR'] = '/var/pops/one';
      expect(recipesRootDir()).toBe('/var/pops/one');
      process.env['FOOD_RECIPES_DIR'] = '/var/pops/two';
      expect(recipesRootDir()).toBe('/var/pops/two');
    });
  });

  describe('assertValidRecipeId', () => {
    it('accepts positive integers', () => {
      expect(() => assertValidRecipeId(1)).not.toThrow();
      expect(() => assertValidRecipeId(42)).not.toThrow();
    });
    it.each([0, -1, 1.5, '42', '0', '../etc/passwd', 'abc', '', null, undefined, {}])(
      'rejects %p',
      (val) => {
        expect(() => assertValidRecipeId(val)).toThrow(/Invalid recipe id/);
      }
    );
  });

  describe('absolute path helpers', () => {
    beforeEach(() => {
      process.env['FOOD_RECIPES_DIR'] = TEST_ROOT;
    });
    it('recipeDirFor joins the root and the recipe id', () => {
      expect(recipeDirFor(7)).toBe(resolve(`${TEST_ROOT}/7`));
    });
    it('heroAbsPathFor uses the given extension', () => {
      expect(heroAbsPathFor(7, 'webp')).toBe(resolve(`${TEST_ROOT}/7/hero.webp`));
    });
    it('thumbAbsPathFor is always webp', () => {
      expect(thumbAbsPathFor(7)).toBe(resolve(`${TEST_ROOT}/7/hero-thumb.webp`));
    });
    it('cardAbsPathFor is always webp', () => {
      expect(cardAbsPathFor(7)).toBe(resolve(`${TEST_ROOT}/7/hero-card.webp`));
    });
    it('rejects an invalid id before composing any path', () => {
      expect(() => recipeDirFor(-1)).toThrow(/Invalid recipe id/);
    });
  });

  describe('relativeHeroPath', () => {
    it('uses POSIX separators regardless of platform', () => {
      const rel = relativeHeroPath(99, 'png');
      expect(rel).toBe('99/hero.png');
      expect(rel.includes('\\')).toBe(false);
    });
    it('rejects an invalid id', () => {
      expect(() => relativeHeroPath(0, 'png')).toThrow(/Invalid recipe id/);
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
      'hero.jpg/',
      '..',
    ])('rejects %s', (name) => {
      expect(isValidHeroFilename(name)).toBe(false);
    });
  });

  describe('resolveServablePath', () => {
    beforeEach(() => {
      process.env['FOOD_RECIPES_DIR'] = TEST_ROOT;
    });
    it('resolves a known hero filename under the root', () => {
      expect(resolveServablePath(7, 'hero.jpg')).toBe(resolve(`${TEST_ROOT}/7/hero.jpg`));
    });
    it('returns null for a filename outside the known layout', () => {
      expect(resolveServablePath(7, 'evil.gif')).toBeNull();
    });
    it('returns null rather than escaping the root via the filename', () => {
      // The filename validator rejects separators and `..` outright, so the
      // traversal never reaches the resolve() call below it.
      expect(resolveServablePath(7, '../../etc/passwd')).toBeNull();
      expect(resolveServablePath(7, '..')).toBeNull();
    });
    it('throws rather than escaping the root via the recipe id', () => {
      expect(() => resolveServablePath(-1, 'hero.jpg')).toThrow(/Invalid recipe id/);
    });
    it('keeps every resolved path under the configured root', () => {
      const root = recipesRootDir();
      const resolved = resolveServablePath(7, 'hero-card.webp');
      expect(resolved).not.toBeNull();
      expect(resolved?.startsWith(root + sep)).toBe(true);
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
