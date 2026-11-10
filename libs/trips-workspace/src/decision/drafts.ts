import type { DecisionEditorState } from './editor-types';
import type { DecisionSource, SourceLink, UndoCommand } from './types';

type DraftState = Pick<DecisionEditorState, 'drafts' | 'dirty'>;
type FieldCommand = Extract<UndoCommand, { kind: 'edit-decision' | 'edit-option' }>;

function fieldKeys(command: FieldCommand, drafts: DraftState['drafts']): string[] {
  const prefix = command.kind === 'edit-decision' ? '' : `option-${command.id}-`;
  const keys: string[] = [];
  if ('question' in command.fields && command.fields.question === drafts.question)
    keys.push('question');
  if (command.fields.notes !== undefined && command.fields.notes === drafts[`${prefix}notes`])
    keys.push(`${prefix}notes`);
  if ('deadline' in command.fields && (command.fields.deadline ?? '') === drafts.deadline)
    keys.push('deadline');
  return keys;
}
function appendedLink(
  previous: SourceLink[] | undefined,
  links: SourceLink[] | undefined
): SourceLink | undefined {
  if (!previous || links?.length !== previous.length + 1) return undefined;
  return JSON.stringify(links.slice(0, -1)) === JSON.stringify(previous) ? links.at(-1) : undefined;
}
function linkKeys(
  command: FieldCommand,
  source: DecisionSource,
  drafts: DraftState['drafts']
): string[] {
  const previous =
    command.kind === 'edit-decision'
      ? source.decision.sourceLinks
      : source.options.find((option) => option.id === command.id)?.sourceLinks;
  const key = command.kind === 'edit-decision' ? 'decision-links' : `option-${command.id}-links`;
  const added = appendedLink(previous, command.fields.sourceLinks);
  if (
    !added ||
    added.uri !== drafts[`${key}-uri`] ||
    (added.label ?? '') !== (drafts[`${key}-label`] ?? '')
  )
    return [];
  return [`${key}-uri`, `${key}-label`];
}
function acknowledgedKeys(
  command: UndoCommand,
  source: DecisionSource,
  drafts: DraftState['drafts']
): string[][] {
  if (command.kind === 'add-option')
    return drafts['new-option']?.trim() === command.fields.title ? [['new-option']] : [];
  if (command.kind !== 'edit-decision' && command.kind !== 'edit-option') return [];
  return [...fieldKeys(command, drafts).map((key) => [key]), linkKeys(command, source, drafts)];
}

/** Semantic Decision buffers survive view disposal; only the submitted unchanged buffer is acknowledged. */
export class DecisionDrafts {
  private values: Record<string, string> = {};
  private dirty = new Set<string>();

  /** Preserve explicit headless dirty ownership alongside concrete field/composer values. */
  setDirty(key: string, value: boolean): DraftState {
    if (value) this.dirty.add(key);
    else this.dirty.delete(key);
    return this.snapshot();
  }

  /** Store verbatim text, including invalid or whitespace-only input; undefined explicitly discards it. */
  setDraft(key: string, value: string | undefined): DraftState {
    this.values = { ...this.values };
    if (value === undefined) delete this.values[key];
    else this.values[key] = value;
    return this.setDirty(key, value !== undefined);
  }

  /** A dispatched result can acknowledge its original buffers after the submitting view closes. */
  acknowledge(
    command: UndoCommand,
    source: DecisionSource,
    submitted: DraftState['drafts'],
    undo: boolean
  ): DraftState {
    if (!undo)
      for (const keys of acknowledgedKeys(command, source, submitted))
        this.clearSubmitted(keys, submitted);
    return this.snapshot();
  }
  private clearSubmitted(keys: string[], submitted: DraftState['drafts']): void {
    if (!keys.every((key) => this.values[key] === submitted[key])) return;
    for (const key of keys) this.setDraft(key, undefined);
  }
  private snapshot(): DraftState {
    return { drafts: this.values, dirty: this.dirty.size > 0 };
  }
}
