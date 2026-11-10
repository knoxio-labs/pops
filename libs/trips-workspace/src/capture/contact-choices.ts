import { containsFields, sameFields } from './record-field-match';

import type { ContactChooserSelection, ContactsHostCapability } from '@pops/pillar-sdk';

import type { CaptureContactChoice, CaptureContactIntent } from './contact-choice-types';
import type { CaptureEditor } from './editor-types';
import type { CaptureRecordDrafts, IdeaRecordDraft } from './record-drafts';

export type { CaptureContactChoice, CaptureContactIntent } from './contact-choice-types';

/** Retain Contacts-owned creation state separately from the subsequent Trips association. */
export class CaptureContactChoices {
  private choices = new Map<string, CaptureContactChoice>();
  private contexts = new Map<string, string>();
  private active: CaptureContactChoice | null = null;
  private listeners = new Set<() => void>();
  private prepared = new Set<string>();
  private pendingLinks = new Map<string, IdeaRecordDraft>();
  constructor(
    private editor: CaptureEditor,
    private records: CaptureRecordDrafts,
    private host?: ContactsHostCapability
  ) {
    editor.subscribe(() => this.acceptConfirmation());
  }
  /** Whether the host supplied the real owner chooser required to make a contact choice. */
  get available(): boolean {
    return this.host !== undefined;
  }
  /** Stable current chooser snapshot; its owner session persists while views are unmounted. */
  snapshot = (): CaptureContactChoice | null => this.active;
  /** Canonical owner evidence exists only for selections confirmed during this retained browser intent. */
  hasKnownReference = (uri: string): boolean =>
    [...this.choices.values()].some((choice) => choice.selected?.reference.uri === uri);
  /** Observe only explicit chooser changes, without serializing owner state or file bytes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Resume the same unresolved intent; a new explicit choice may replace only a known canonical selection. */
  open(intent: CaptureContactIntent, another = false): void {
    if (this.host === undefined) return;
    const key = JSON.stringify(intent);
    const previousId = this.contexts.get(key);
    let choice = previousId === undefined ? undefined : this.choices.get(previousId);
    if (choice === undefined || (another && choice.applied)) {
      choice = {
        id: crypto.randomUUID(),
        intent,
        chooser: this.host.createIntent(),
        open: true,
        selected: null,
        applied: false,
        linking: false,
        linkError: null,
      };
      this.contexts.set(key, choice.id);
    }
    this.update({ ...choice, open: true });
  }
  /** Closing a view never replaces its pending, uncertain or known-created owner receipt. */
  changeOpen(open: boolean): void {
    if (this.active !== null) this.update({ ...this.active, open });
  }
  /** Retain the actual owner reference before attempting any Trips link, including when its source disappeared. */
  accept(id: string, selection: ContactChooserSelection): void {
    const choice = this.choices.get(id);
    if (choice === undefined || !choice.open || this.active?.id !== id) return;
    const selected = {
      ...choice,
      open: false,
      selected: {
        name: selection.name,
        reference: { ...selection.reference },
      },
    };
    this.choices.set(id, selected);
    if (this.active?.id !== id) return;
    this.update(selected);
    void this.applySelection();
  }
  /** Prepare a Capture target draft or retry an Idea link; only confirmed Idea writes apply the selection. Never creates or resolves Contacts. */
  async applySelection(): Promise<void> {
    const choice = this.active;
    if (choice === null || choice.selected === null || choice.applied || choice.linking) return;
    const source = this.editor.getState().source;
    const reference = { uri: choice.selected.reference.uri };
    if (choice.intent.kind === 'capture') {
      const capture = source.captures.find(
        (row) => row.id === choice.intent.id && row.removedAt === null
      );
      if (capture === undefined) return;
      this.records.chooseTarget(capture, {
        mode: 'existing',
        target: { kind: 'contact', reference },
      });
      this.update({ ...choice, applied: true, linkError: null });
    } else await this.applyIdea(choice, reference);
  }
  private async applyIdea(choice: CaptureContactChoice, reference: { uri: string }): Promise<void> {
    const idea = this.editor
      .getState()
      .source.ideas.find((row) => row.id === choice.intent.id && row.removedAt === null);
    if (idea === undefined) {
      this.update({ ...choice, linkError: 'The owning Idea is unavailable.' });
      return;
    }
    if (!this.prepared.has(choice.id)) this.prepareIdea(choice, idea, reference);
    const submitted = this.records.idea(idea.id);
    if (submitted !== undefined) this.pendingLinks.set(choice.id, submitted);
    this.update({ ...choice, linking: true, linkError: null });
    await this.records.saveIdea(idea.id);
    const current = this.choices.get(choice.id);
    if (current !== undefined)
      this.update(
        {
          ...current,
          linking: false,
          linkError: current.applied
            ? null
            : 'The contact is retained. Confirm or retry the Trips operation, then retry linking.',
        },
        false
      );
  }
  private prepareIdea(
    choice: CaptureContactChoice,
    idea: Parameters<CaptureRecordDrafts['editIdea']>[0],
    reference: { uri: string }
  ): void {
    const draft = this.records.idea(idea.id)?.input;
    if (choice.intent.kind === 'idea-contact')
      this.records.editIdea(idea, {
        contactLinks: [...(draft?.contactLinks ?? idea.contactLinks), reference],
      });
    else
      this.records.editIdea(idea, {
        recommendations: [
          ...(draft?.recommendations ?? idea.recommendations),
          { contact: reference, note: '' },
        ],
      });
    this.prepared.add(choice.id);
  }
  private acceptConfirmation(): void {
    const confirmation = this.editor.getState().confirmation;
    if (confirmation === null || confirmation.result.undone) return;
    const command = confirmation.request.command;
    if (command.kind !== 'idea.update') return;
    const row = confirmation.result.current.ideas.find((item) => item.id === command.id);
    for (const [id, draft] of this.pendingLinks) {
      const choice = this.choices.get(id);
      if (
        choice?.intent.id === command.id &&
        row &&
        draft.revision === command.expectedRevision &&
        sameFields(draft.input, command.input) &&
        containsFields(row, command.input)
      ) {
        this.update({ ...choice, applied: true, linking: false, linkError: null }, false);
        this.pendingLinks.delete(id);
      }
    }
  }
  private update(choice: CaptureContactChoice, activate = true): void {
    this.choices.set(choice.id, choice);
    if (!activate && this.active?.id !== choice.id) return;
    this.active = choice;
    for (const listener of this.listeners) listener();
  }
}
