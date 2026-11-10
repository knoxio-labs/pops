import { getCapture, getIdea, requireSourceRevision } from './source-queries.js';
import {
  addExploreMembership,
  removeExploreMembership,
  removeCaptureAssociation,
  organiseCapture,
} from './source-relation-write.js';
import {
  createCaptureSource,
  changeCaptureSource,
  createIdeaSource,
  changeIdeaSource,
} from './source-row-write.js';

import type { SourceCommand } from '../../contract/source-workspace.js';
import type { SourceWrite } from './source-write-types.js';

function captureCreate(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'capture.create' }>
): void {
  const capture = createCaptureSource(write, command.input);
  if (command.target !== undefined)
    organiseCapture(write, {
      kind: 'capture.organise',
      id: capture.id,
      expectedRevision: capture.revision,
      target: command.target,
      ...(command.explore === undefined ? {} : { explore: command.explore }),
    });
  else if (command.explore) addExploreMembership(write, { kind: 'capture', id: capture.id });
}
function ideaCreate(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'idea.create' }>
): void {
  const idea = createIdeaSource(write, command.input);
  if (command.explore) addExploreMembership(write, { kind: 'idea', id: idea.id });
}
function captureEdit(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'capture.update' | 'capture.attach' | 'capture.remove' }>
): void {
  const before = getCapture(write.db, write.tripId, command.id);
  requireSourceRevision(before, command.expectedRevision);
  if (command.kind === 'capture.update') changeCaptureSource(write, before, command.input);
  else if (command.kind === 'capture.remove')
    changeCaptureSource(write, before, { removedAt: new Date().toISOString() });
  else
    changeCaptureSource(write, before, {
      attachments: [...before.attachments, command.attachment],
    });
}
function ideaEdit(
  write: SourceWrite,
  command: Extract<SourceCommand, { kind: 'idea.update' | 'idea.remove' }>
): void {
  const before = getIdea(write.db, write.tripId, command.id);
  requireSourceRevision(before, command.expectedRevision);
  changeIdeaSource(
    write,
    before,
    command.kind === 'idea.update' ? command.input : { removedAt: new Date().toISOString() }
  );
}
/** Execute one explicit command within the caller's transaction and record only its own inverse. */
export function writeSourceCommand(
  write: SourceWrite,
  command: Exclude<SourceCommand, { kind: 'undo' }>
): void {
  switch (command.kind) {
    case 'capture.create':
      return captureCreate(write, command);
    case 'capture.update':
    case 'capture.attach':
    case 'capture.remove':
      return captureEdit(write, command);
    case 'idea.create':
      return ideaCreate(write, command);
    case 'idea.update':
    case 'idea.remove':
      return ideaEdit(write, command);
    case 'capture.organise':
      return organiseCapture(write, command);
    case 'association.remove':
      return removeCaptureAssociation(write, command);
    case 'explore.add':
      return addExploreMembership(write, command.source);
    case 'explore.remove':
      return removeExploreMembership(write, command);
  }
}
