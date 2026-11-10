import { eq } from 'drizzle-orm';

import { CaptureSchema } from '../../contract/capture-schemas.js';
import { IdeaSchema } from '../../contract/idea-schemas.js';
import { captures, ideas } from '../schema.js';
import { validateSourceLocation } from './source-queries.js';
import { recordSourceWrite } from './source-write-record.js';

import type { CaptureInput, CapturePatch, TripCapture } from '../../contract/capture-schemas.js';
import type { IdeaInput, TripIdea } from '../../contract/idea-schemas.js';
import type { SourceWrite } from './source-write-types.js';

/** Advance one owned row revision with a fresh audit timestamp. */
export function nextSourceRevision(record: { revision: number }): {
  revision: number;
  updatedAt: string;
} {
  return { revision: record.revision + 1, updatedAt: new Date().toISOString() };
}
/** Insert immutable capture material and record its tombstone inverse. */
export function createCaptureSource(write: SourceWrite, input: CaptureInput): TripCapture {
  validateSourceLocation(write.db, write.tripId, input);
  const after = CaptureSchema.parse(
    write.db
      .insert(captures)
      .values({ ...input, tripId: write.tripId })
      .returning()
      .get()
  );
  recordSourceWrite(write.receipt.captures, write.inverse.captures, after, null);
  return after;
}
/** Patch explicit capture fields and record the prior row within the owning transaction. */
export function changeCaptureSource(
  write: SourceWrite,
  before: TripCapture,
  input: CapturePatch & { attachments?: TripCapture['attachments']; removedAt?: string }
): TripCapture {
  validateSourceLocation(write.db, write.tripId, input);
  const after = CaptureSchema.parse(
    write.db
      .update(captures)
      .set({ ...input, ...nextSourceRevision(before) })
      .where(eq(captures.id, before.id))
      .returning()
      .get()
  );
  recordSourceWrite(write.receipt.captures, write.inverse.captures, after, before);
  return after;
}
/** Insert an independent Idea and record its tombstone inverse. */
export function createIdeaSource(write: SourceWrite, input: IdeaInput): TripIdea {
  validateSourceLocation(write.db, write.tripId, input);
  const after = IdeaSchema.parse(
    write.db
      .insert(ideas)
      .values({ ...input, tripId: write.tripId })
      .returning()
      .get()
  );
  recordSourceWrite(write.receipt.ideas, write.inverse.ideas, after, null);
  return after;
}
/** Patch an Idea without deriving route or external owner facts. */
export function changeIdeaSource(
  write: SourceWrite,
  before: TripIdea,
  input: IdeaInput & { removedAt?: string }
): void {
  validateSourceLocation(write.db, write.tripId, input);
  const after = IdeaSchema.parse(
    write.db
      .update(ideas)
      .set({ ...input, ...nextSourceRevision(before) })
      .where(eq(ideas.id, before.id))
      .returning()
      .get()
  );
  recordSourceWrite(write.receipt.ideas, write.inverse.ideas, after, before);
}
