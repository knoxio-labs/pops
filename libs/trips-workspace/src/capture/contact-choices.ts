import { IdeaContactLinks } from './idea-contact-links';

import type { ContactChooserSelection, ContactsHostCapability } from '@pops/pillar-sdk';

import type { CaptureContactChoice, CaptureContactIntent } from './contact-choice-types';
import type { CaptureEditor } from './editor-types';
import type { CaptureRecordDrafts } from './record-drafts';

export type { CaptureContactChoice, CaptureContactIntent } from './contact-choice-types';

/** Retain Contacts-owned creation state separately from the subsequent Trips association. */
export class CaptureContactChoices {
  private choices = new Map<string, CaptureContactChoice>();
  private contexts = new Map<string, string>();
  private active: CaptureContactChoice | null = null;
  private listeners = new Set<() => void>();
  private links: IdeaContactLinks;
  constructor(
    private editor: CaptureEditor,
    private records: CaptureRecordDrafts,
    private host?: ContactsHostCapability
  ) {
    this.links = new IdeaContactLinks(
      editor,
      records,
      (id) => this.choices.get(id),
      (choice, activate) => this.update(choice, activate)
    );
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
  /** Resume retained owner work; explicit replacement gets a new intent unless this link has an unresolved command. */
  open(intent: CaptureContactIntent, another = false): void {
    if (this.host === undefined) return;
    const key = JSON.stringify(intent);
    const previousId = this.contexts.get(key);
    let choice = previousId === undefined ? undefined : this.choices.get(previousId);
    if (choice && another && !choice.applied && !this.links.release(choice)) return;
    if (choice === undefined || (another && choice.selected !== null)) {
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
    this.update({ ...choice, open: choice.selected === null });
  }
  /** Closing a view never replaces its pending, uncertain or known-created owner receipt. */
  changeOpen(open: boolean): void {
    if (this.active !== null)
      this.update({ ...this.active, open: open && this.active.selected === null });
  }
  /** Retain the actual owner reference before attempting any Trips link, including when its source disappeared. */
  accept(id: string, selection: ContactChooserSelection): void {
    const choice = this.choices.get(id);
    if (choice === undefined || !choice.open || choice.selected !== null || this.active?.id !== id)
      return;
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
    } else await this.links.apply(choice, reference);
  }
  /** Start a new explicit selection without deleting the old owner receipt or abandoning its unknown write. */
  chooseAnother(): void {
    if (this.active !== null) this.open(this.active.intent, true);
  }
  /** Explicitly restore only the selected link after a draft discard; unresolved requests remain immutable. */
  restoreSelection(): void {
    if (this.active !== null) this.links.restore(this.active);
  }
  private update(choice: CaptureContactChoice, activate = true): void {
    this.choices.set(choice.id, choice);
    if (!activate && this.active?.id !== choice.id) return;
    this.active = choice;
    for (const listener of this.listeners) listener();
  }
}
