import { describe, expect, it } from 'vitest';

import { egoAppContextSchema } from '../../../../contract/rest-ego-schemas.js';
import { appContextChanged } from '../chat-helpers.js';
import { biasScopes } from '../context-helpers.js';
import { buildEgoSystemPrompt, formatAppContextBlock } from '../prompts.js';

describe('biasScopes', () => {
  it.each([
    ['purchases', 'personal.purchases'],
    ['food', 'personal.food'],
    ['lists', 'personal.lists'],
  ])('adds the %s prefix additively', (app, prefix) => {
    expect(biasScopes(['work.notes'], { app })).toEqual(['work.notes', prefix]);
  });

  it('does not duplicate a prefix already present', () => {
    expect(biasScopes(['personal.purchases'], { app: 'purchases' })).toEqual([
      'personal.purchases',
    ]);
  });

  it('leaves scopes untouched for an app with no prefix', () => {
    expect(biasScopes(['work.notes'], { app: 'unknown-app' })).toEqual(['work.notes']);
  });
});

describe('formatAppContextBlock', () => {
  it('renders the entity title with its id', () => {
    const block = formatAppContextBlock({
      app: 'inventory',
      entityType: 'item',
      entityId: 'abc',
      entityTitle: 'Bosch drill',
    });
    expect(block).toContain('Viewing item: Bosch drill (abc)');
  });

  it('states that a non-engram entity exposes only its title and id', () => {
    const block = formatAppContextBlock({
      app: 'purchases',
      entityType: 'purchase',
      entityId: '42',
      entityTitle: 'Drill',
    });
    expect(block).toContain('only the title and id');
  });

  it('does not add the limitation for an engram', () => {
    const block = formatAppContextBlock({ app: 'cerebrum', entityType: 'engram', entityId: 'e1' });
    expect(block).not.toContain('only the title and id');
  });

  it('falls back to the bare id without a title', () => {
    const block = formatAppContextBlock({ app: 'inventory', entityType: 'item', entityId: 'abc' });
    expect(block).toContain('Viewing item: abc');
  });

  it('carries the block into the system prompt', () => {
    const prompt = buildEgoSystemPrompt([], {
      app: 'inventory',
      entityType: 'item',
      entityId: 'abc',
      entityTitle: 'Bosch drill',
    });
    expect(prompt).toContain('Bosch drill');
  });
});

describe('egoAppContextSchema', () => {
  it('accepts a context without entityTitle', () => {
    expect(egoAppContextSchema.safeParse({ app: 'finance' }).success).toBe(true);
  });

  it('keeps entityTitle', () => {
    expect(egoAppContextSchema.parse({ app: 'finance', entityTitle: 'x' }).entityTitle).toBe('x');
  });
});

describe('appContextChanged', () => {
  const stored = {
    app: 'inventory',
    route: '/inventory/items/42',
    entityType: 'item',
    entityId: '42',
    entityTitle: 'Bosch drill',
  };

  it('is false for an identical context', () => {
    expect(appContextChanged(stored, { ...stored })).toBe(false);
  });

  it('is true when only the entity title changed', () => {
    expect(appContextChanged(stored, { ...stored, entityTitle: 'Bosch hammer drill' })).toBe(true);
  });

  it('is true when a title appears on a context stored without one', () => {
    const { entityTitle: _title, ...untitled } = stored;
    expect(appContextChanged(untitled, stored)).toBe(true);
  });
});
