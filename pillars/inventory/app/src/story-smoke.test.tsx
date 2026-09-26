import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentType } from 'react';

type StoryModule = Parameters<typeof composeStories>[0];
type ComposedStory = ComponentType & {
  play?: (context?: { canvasElement: HTMLElement }) => Promise<void>;
  storyName: string;
};

function isStoryModule(value: unknown): value is StoryModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'default' in value &&
    typeof value.default === 'object' &&
    value.default !== null
  );
}

function isComposedStory(value: unknown): value is ComposedStory {
  return typeof value === 'function' && 'storyName' in value && typeof value.storyName === 'string';
}

const storyModules = import.meta.glob('./**/*.stories.tsx', { eager: true });
const storyModuleEntries = Object.entries(storyModules);

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

describe('every inventory app story renders', () => {
  it('discovers inventory app stories', () => {
    expect(storyModuleEntries.length).toBeGreaterThan(0);
  });

  for (const [path, storyModule] of storyModuleEntries) {
    if (!isStoryModule(storyModule)) {
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
