import {
  containsContactLink,
  discardPreparedContactLink,
  prepareContactLink,
} from './contact-link-draft';
import { containsFields, sameFields } from './record-field-match';

import type { CaptureContactChoice } from './contact-choice-types';
import type { PreparedContactLink } from './contact-link-draft';
import type { CaptureEditor } from './editor-types';
import type { CaptureRecordDrafts, IdeaRecordDraft } from './record-drafts';
import type { CaptureCommand, CaptureSource } from './types';

type ContactLinkAttempt = { operationId: string; draft: IdeaRecordDraft };
type IdeaUpdate = Extract<CaptureCommand, { kind: 'idea.update' }>;
type Idea = CaptureSource['ideas'][number];

function matchesLinkPayload(
  command: IdeaUpdate,
  row: Idea,
  link: PreparedContactLink,
  draft: IdeaRecordDraft
): boolean {
  return (
    draft.revision === command.expectedRevision &&
    sameFields(draft.input, command.input) &&
    containsContactLink(link, command.input) &&
    containsContactLink(link, row) &&
    containsFields(row, command.input)
  );
}

/** Coordinate finite Idea Contact links with exact operation ownership and retained owner receipts. */
export class IdeaContactLinks {
  private prepared = new Map<string, PreparedContactLink>();
  private pendingLinks = new Map<string, ContactLinkAttempt>();
  constructor(
    private editor: CaptureEditor,
    private records: CaptureRecordDrafts,
    private readChoice: (id: string) => CaptureContactChoice | undefined,
    private update: (choice: CaptureContactChoice, activate?: boolean) => void
  ) {
    editor.subscribe(() => this.acceptConfirmation());
  }
  /** Release only this intent's prepared entry; an unresolved owned command cannot be abandoned. */
  release(choice: CaptureContactChoice): boolean {
    if (this.unknownLink(choice)) {
      this.update({ ...choice, open: false, linkError: this.unknownMessage() });
      return false;
    }
    const idea = this.editor.getState().source.ideas.find((row) => row.id === choice.intent.id);
    const prepared = this.prepared.get(choice.id);
    if (idea && prepared) discardPreparedContactLink(this.records, idea, prepared);
    return true;
  }
  /** Explicitly restore only the selected link after a draft discard; unresolved requests remain immutable. */
  restore(choice: CaptureContactChoice): void {
    if (!choice.selected || choice.applied || choice.intent.kind === 'capture') return;
    if (this.unknownLink(choice)) {
      this.update({ ...choice, linkError: this.unknownMessage() });
      return;
    }
    const idea = this.editor.getState().source.ideas.find((row) => row.id === choice.intent.id);
    if (!idea || idea.removedAt !== null) return;
    const prepared = this.prepared.get(choice.id);
    const draft = this.records.idea(idea.id);
    if (prepared && draft && containsContactLink(prepared, draft.input)) return;
    this.prepared.set(
      choice.id,
      prepareContactLink(this.records, idea, choice.intent.kind, choice.selected.reference.uri)
    );
    this.update({ ...choice, linkError: null });
  }
  /** Save only a draft containing this immutable selection and bind its exact operation UUID before awaiting it. */
  async apply(choice: CaptureContactChoice, reference: { uri: string }): Promise<void> {
    const idea = this.editor
      .getState()
      .source.ideas.find((row) => row.id === choice.intent.id && row.removedAt === null);
    if (idea === undefined) {
      this.update({ ...choice, linkError: 'The owning Idea is unavailable.' });
      return;
    }
    if (!this.prepared.has(choice.id) && choice.intent.kind !== 'capture')
      this.prepared.set(
        choice.id,
        prepareContactLink(this.records, idea, choice.intent.kind, reference.uri)
      );
    const prepared = this.prepared.get(choice.id);
    const submitted = this.records.idea(idea.id);
    if (!prepared || !submitted || !containsContactLink(prepared, submitted.input)) {
      this.update({
        ...choice,
        linkError:
          'The link draft was discarded or changed. Restore the selected link before retrying.',
      });
      return;
    }
    this.update({ ...choice, linking: true, linkError: null });
    const pendingBefore = this.editor.getPendingRequest();
    const saving = this.records.saveIdea(idea.id);
    const pendingAfter = this.editor.getPendingRequest();
    if (pendingBefore === null && pendingAfter !== null)
      this.pendingLinks.set(choice.id, {
        operationId: pendingAfter.operationId,
        draft: structuredClone(submitted),
      });
    await saving;
    const current = this.readChoice(choice.id);
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
  private unknownLink(choice: CaptureContactChoice): boolean {
    const attempt = this.pendingLinks.get(choice.id);
    return (
      attempt !== undefined && this.editor.getPendingRequest()?.operationId === attempt.operationId
    );
  }
  private unknownMessage(): string {
    return 'Resolve the retained Trips link request before changing or restoring this selection.';
  }
  private acceptConfirmation(): void {
    const confirmation = this.editor.getState().confirmation;
    if (confirmation === null || confirmation.result.undone) return;
    const command = confirmation.request.command;
    if (command.kind !== 'idea.update') return;
    const row = confirmation.result.current.ideas.find((item) => item.id === command.id);
    for (const [id, attempt] of this.pendingLinks)
      this.confirmLink(id, attempt, {
        operationId: confirmation.request.operationId,
        command,
        row,
      });
  }
  private confirmLink(
    id: string,
    attempt: ContactLinkAttempt,
    confirmation: { operationId: string; command: IdeaUpdate; row: Idea | undefined }
  ): void {
    const { operationId, command, row } = confirmation;
    const choice = this.readChoice(id);
    const prepared = this.prepared.get(id);
    if (!choice || !prepared || !row) return;
    if (
      attempt.operationId === operationId &&
      choice.intent.id === command.id &&
      choice.selected?.reference.uri === prepared.reference.uri &&
      matchesLinkPayload(command, row, prepared, attempt.draft)
    ) {
      this.update({ ...choice, applied: true, linking: false, linkError: null }, false);
      this.pendingLinks.delete(id);
    }
  }
}
