import { expect, it } from 'vitest';

import { DecisionDrafts } from './drafts';
import { sourceDecision } from './test-utils';

it('acknowledges only explicit submitted fields and preserves separately owned dirty intent', () => {
  const drafts = new DecisionDrafts();
  drafts.setDirty('notes', true);
  const submitted = drafts.setDraft('question', 'New question').drafts;
  expect(
    drafts.acknowledge(
      { kind: 'edit-decision', fields: { question: 'New question' } },
      sourceDecision(),
      submitted,
      false
    )
  ).toEqual({ drafts: {}, dirty: true });
});
it('retains changed text and whitespace-only composers until explicit cancellation', () => {
  const drafts = new DecisionDrafts();
  const submitted = drafts.setDraft('new-option', '  Afternoon  ').drafts;
  drafts.setDraft('new-option', '   ');
  expect(
    drafts.acknowledge(
      { kind: 'add-option', fields: { title: 'Afternoon' } },
      sourceDecision(),
      submitted,
      false
    )
  ).toEqual({ drafts: { 'new-option': '   ' }, dirty: true });
  expect(drafts.setDraft('new-option', undefined)).toEqual({ drafts: {}, dirty: false });
});
it('clears a confirmed option composer without clearing buffers during Undo', () => {
  const drafts = new DecisionDrafts();
  const submitted = drafts.setDraft('new-option', '  Afternoon  ').drafts;
  const command = { kind: 'add-option' as const, fields: { title: 'Afternoon' } };
  expect(drafts.acknowledge(command, sourceDecision(), submitted, true).dirty).toBe(true);
  expect(drafts.acknowledge(command, sourceDecision(), submitted, false)).toEqual({
    drafts: {},
    dirty: false,
  });
});
it('acknowledges only a confirmed link append and preserves the whole composer if either buffer changed', () => {
  const drafts = new DecisionDrafts();
  drafts.setDraft('decision-links-uri', 'opaque:value');
  const submitted = drafts.setDraft('decision-links-label', 'Original label').drafts;
  const command = {
    kind: 'edit-decision' as const,
    fields: { sourceLinks: [{ uri: 'opaque:value', label: 'Original label' }] },
  };
  drafts.setDraft('decision-links-label', 'Changed label');
  expect(drafts.acknowledge(command, sourceDecision(), submitted, false).drafts).toEqual({
    'decision-links-uri': 'opaque:value',
    'decision-links-label': 'Changed label',
  });
  drafts.setDraft('decision-links-label', 'Original label');
  const existing = sourceDecision();
  existing.decision.sourceLinks = command.fields.sourceLinks;
  expect(drafts.acknowledge(command, existing, submitted, false).dirty).toBe(true);
  expect(drafts.acknowledge(command, sourceDecision(), submitted, false)).toEqual({
    drafts: {},
    dirty: false,
  });
});
