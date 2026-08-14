import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import previewAnnotations from '../.storybook/preview';

import type { ReactRenderer } from '@storybook/react-vite';
import type { Args, ComposedStoryFn, Store_CSFExports } from 'storybook/internal/types';

setProjectAnnotations([previewAnnotations]);

type ComposedStory = ComposedStoryFn<ReactRenderer, Partial<Args>>;

function isCsfModule(value: unknown): value is Store_CSFExports<ReactRenderer> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate: { default?: unknown } = value;
  return typeof candidate.default === 'object' && candidate.default !== null;
}

function isComposedStory(value: unknown): value is ComposedStory {
  return typeof value === 'function' && 'storyName' in value;
}

const storyModules = import.meta.glob('./**/*.stories.tsx', { eager: true });

const consoleErrors: string[] = [];

beforeEach(() => {
  consoleErrors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map((arg) => String(arg)).join(' '));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('every @pops/ui story renders', () => {
  for (const [path, storyModule] of Object.entries(storyModules)) {
    if (!isCsfModule(storyModule)) {
      it(`${path} exports a Storybook meta`, () => {
        expect.unreachable(`${path} has no default export — Storybook cannot load it`);
      });
      continue;
    }

    const exported = Object.entries(composeStories(storyModule));
    const stories: [string, ComposedStory][] = [];
    for (const [name, value] of exported) {
      if (isComposedStory(value)) stories.push([name, value]);
    }

    it(`${path} exports stories Storybook can compose`, () => {
      expect(stories.length).toBe(exported.length);
      expect(stories.length).toBeGreaterThan(0);
    });

    for (const [name, Story] of stories) {
      it(`${path} › ${name}`, async () => {
        const { container } = render(<Story />);
        await Story.play?.({ canvasElement: container });

        expect(container.innerHTML).not.toBe('');
        expect(consoleErrors).toEqual([]);
      });
    }
  }
});
