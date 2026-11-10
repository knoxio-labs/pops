import { ContactChooserSession } from '@pops/app-contacts';

import type { ContactChooserProps, ContactReference } from '@pops/app-contacts';

import type { CaptureEditor } from './editor-types';
import type { CaptureRecordDrafts } from './record-drafts';

/** Finite owning source contexts for Contacts selection; no Trips-owned Person is created. */
export type CaptureContactIntent = {
  kind: 'capture' | 'idea-contact' | 'recommendation';
  id: number;
};
/** A retained owner intent and canonical selection; unknown creation outcomes survive route remount. */
export interface CaptureContactChoice {
  id: string;
  intent: CaptureContactIntent;
  session: ContactChooserSession;
  open: boolean;
  selected: { name: string; reference: ContactReference } | null;
  applied: boolean;
}

/** Retain Contacts-owned creation state separately from the subsequent Trips association. */
export class CaptureContactChoices {
  private choices = new Map<string, CaptureContactChoice>();
  private contexts = new Map<string, string>();
  private active: CaptureContactChoice | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private editor: CaptureEditor,
    private records: CaptureRecordDrafts
  ) {}
  /** Stable current chooser snapshot; its owner session persists while views are unmounted. */
  snapshot = (): CaptureContactChoice | null => this.active;
  /** Observe only explicit chooser changes, without serializing owner state or file bytes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Resume the same unresolved intent; a new explicit choice may replace only a known canonical selection. */
  open(intent: CaptureContactIntent, another = false): void {
    const key = JSON.stringify(intent);
    const previousId = this.contexts.get(key);
    let choice = previousId === undefined ? undefined : this.choices.get(previousId);
    if (choice === undefined || (another && choice.selected !== null)) {
      choice = {
        id: crypto.randomUUID(),
        intent,
        session: new ContactChooserSession(),
        open: true,
        selected: null,
        applied: false,
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
  accept(
    id: string,
    entity: Parameters<ContactChooserProps['onSelect']>[0],
    reference: ContactReference
  ): void {
    const choice = this.choices.get(id);
    if (choice === undefined) return;
    const selected = {
      ...choice,
      open: false,
      selected: { name: entity.name, reference: { ...reference } },
    };
    this.choices.set(id, selected);
    if (this.active?.id !== id) return;
    this.update(selected);
    this.applySelection();
  }
  /** Retry only the retained canonical link; this method never calls Contacts create or resolve. */
  applySelection(): void {
    const choice = this.active;
    if (choice === null || choice.selected === null || choice.applied) return;
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
    } else if (!this.applyIdea(choice, reference)) return;
    this.update({ ...choice, applied: true });
  }
  private applyIdea(choice: CaptureContactChoice, reference: { uri: string }): boolean {
    const idea = this.editor
      .getState()
      .source.ideas.find((row) => row.id === choice.intent.id && row.removedAt === null);
    if (idea === undefined) return false;
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
    void this.records.saveIdea(idea.id);
    return true;
  }
  private update(choice: CaptureContactChoice): void {
    this.choices.set(choice.id, choice);
    this.active = choice;
    for (const listener of this.listeners) listener();
  }
}
