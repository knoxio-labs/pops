import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, expect, it } from 'vitest';

import { DecisionLinks } from './DecisionLinks';
import { DecisionOptions } from './DecisionOptions';
import { createDecisionEditor } from './editor';
import { sourceDecision } from './test-utils';

import type { JSX } from 'react';

import type { DecisionEditor } from './editor-types';
import type { AppliedDecisionChange, DecisionSource, UndoCommand } from './types';

afterEach(cleanup);
function deferredEditor() {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const editor = createDecisionEditor(sourceDecision(), async (source, command) => {
    await gate;
    return apply(source, command);
  });
  return { editor, release: () => release?.() };
}
function apply(source: DecisionSource, command: UndoCommand): AppliedDecisionChange {
  const decision = { ...source.decision, revision: source.decision.revision + 1 };
  if (command.kind === 'edit-decision')
    return { source: { ...source, decision: { ...decision, ...command.fields } }, inverse: null };
  const option = source.options[0];
  if (command.kind !== 'add-option' || !option) throw new Error('Unsupported test command');
  return {
    source: { decision, options: [...source.options, { ...option, ...command.fields, id: 10 }] },
    inverse: { kind: 'remove-option', id: 10 },
  };
}
function Composers({
  editor,
  kind,
}: {
  editor: DecisionEditor;
  kind: 'option' | 'link';
}): JSX.Element {
  const state = useSyncExternalStore(editor.subscribe, editor.getState, editor.getState);
  if (kind === 'option') return <DecisionOptions editor={editor} state={state} plans={[]} />;
  return (
    <DecisionLinks
      editor={editor}
      links={state.source.decision.sourceLinks}
      fieldKey="decision-links"
      save={(sourceLinks) =>
        editor.commit({ kind: 'edit-decision', fields: { sourceLinks } }, 'Add source')
      }
    />
  );
}
function twoViews(editor: DecisionEditor, kind: 'option' | 'link') {
  render(
    <>
      <section aria-label="First view">
        <Composers editor={editor} kind={kind} />
      </section>
      <section aria-label="Second view">
        <Composers editor={editor} kind={kind} />
      </section>
    </>
  );
  return {
    first: within(screen.getByRole('region', { name: 'First view' })),
    second: within(screen.getByRole('region', { name: 'Second view' })),
  };
}

it('keeps a newer option title entered from another view while the original add settles', async () => {
  const { editor, release } = deferredEditor();
  const { first, second } = twoViews(editor, 'option');
  fireEvent.click(first.getByRole('button', { name: 'Add option' }));
  fireEvent.change(first.getByLabelText('Option name'), { target: { value: 'First option' } });
  fireEvent.click(first.getByRole('button', { name: /^Add$/ }));
  expect(editor.getState().busy).toBe(true);
  expect(second.getByLabelText('Option name')).toBeEnabled();
  fireEvent.change(second.getByLabelText('Option name'), {
    target: { value: 'Newer option draft' },
  });
  await act(async () => {
    release();
  });
  expect(first.getByLabelText('Option name')).toHaveValue('Newer option draft');
  expect(second.getByLabelText('Option name')).toHaveValue('Newer option draft');
  expect(editor.getState()).toMatchObject({
    busy: false,
    dirty: true,
    drafts: { 'new-option': 'Newer option draft' },
  });
});

it('keeps the complete newer link composer when its submitted predecessor settles', async () => {
  const { editor, release } = deferredEditor();
  const { first, second } = twoViews(editor, 'link');
  fireEvent.click(first.getByText('Sources'));
  fireEvent.change(first.getByLabelText('Source URI'), { target: { value: 'opaque:source' } });
  fireEvent.change(first.getByLabelText('Source label'), { target: { value: 'Submitted label' } });
  fireEvent.click(first.getByRole('button', { name: 'Add source' }));
  expect(editor.getState().busy).toBe(true);
  expect(second.getByLabelText('Source label')).toBeEnabled();
  fireEvent.change(second.getByLabelText('Source label'), {
    target: { value: 'Newer label draft' },
  });
  await act(async () => {
    release();
  });
  expect(first.getByLabelText('Source URI')).toHaveValue('opaque:source');
  expect(second.getByLabelText('Source label')).toHaveValue('Newer label draft');
  expect(editor.getState().source.decision.sourceLinks).toEqual([
    { uri: 'opaque:source', label: 'Submitted label' },
  ]);
  expect(editor.getState().dirty).toBe(true);
});

it('still clears acknowledged option and link text when no newer draft was entered', async () => {
  const option = deferredEditor();
  const view = render(<Composers editor={option.editor} kind="option" />);
  fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
  fireEvent.change(screen.getByLabelText('Option name'), { target: { value: 'First option' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await act(async () => {
    option.release();
  });
  expect(screen.queryByLabelText('Option name')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add option' })).toBeVisible();
  expect(option.editor.getState().dirty).toBe(false);
  view.unmount();
  const link = deferredEditor();
  render(<Composers editor={link.editor} kind="link" />);
  fireEvent.click(screen.getByText('Sources'));
  fireEvent.change(screen.getByLabelText('Source URI'), { target: { value: 'opaque:source' } });
  fireEvent.change(screen.getByLabelText('Source label'), { target: { value: 'Submitted label' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
  await act(async () => {
    link.release();
  });
  expect(screen.getByLabelText('Source URI')).toHaveValue('');
  expect(screen.getByLabelText('Source label')).toHaveValue('');
  expect(link.editor.getState().dirty).toBe(false);
});
