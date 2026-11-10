import { describe, expect, it } from 'vitest';

import { CaptureInputSchema, CapturePatchSchema } from '../capture-schemas.js';
import { IdeaInputSchema } from '../idea-schemas.js';
import { capturesContract, ideasContract } from '../source-workspace.js';

describe('Capture and Idea source contracts', () => {
  it('preserves verbatim source text and opaque URLs without parsing fields from them', () => {
    const source = { originalText: '  Olá\n\t🌆  ', originalUrl: '  source:unsanitised text  ' };
    expect(CaptureInputSchema.parse(source)).toEqual(source);
    expect(CaptureInputSchema.safeParse({ originalText: ' \n\t ' }).success).toBe(false);
    expect(CaptureInputSchema.safeParse({ originalText: '', originalUrl: '' }).success).toBe(false);
    expect(
      CaptureInputSchema.safeParse({
        originalText: '',
        attachments: [{ kind: 'task', taskId: 'accepted-task' }],
      }).success
    ).toBe(true);
    expect(
      CaptureInputSchema.safeParse({
        originalText: '',
        attachments: [{ kind: 'document', documentId: 42, taskId: 'accepted-task' }],
      }).success
    ).toBe(true);
  });
  it('rejects browser-file stand-ins, invented originals and mutation of immutable source fields', () => {
    for (const attachment of [
      { name: 'ticket.pdf', size: 12, type: 'application/pdf' },
      { kind: 'document', documentId: 0 },
      { kind: 'document', documentId: 42, name: 'pretend.pdf' },
      { kind: 'task', taskId: '../task' },
      { kind: 'task', taskId: '' },
    ])
      expect(
        CaptureInputSchema.safeParse({ originalText: '', attachments: [attachment] }).success
      ).toBe(false);
    for (const field of ['originalText', 'originalUrl', 'attachments'])
      expect(CapturePatchSchema.safeParse({ [field]: 'replacement' }).success).toBe(false);
  });
  it('publishes approved independent Idea vocabulary and actual calendar boundaries', () => {
    expect(
      IdeaInputSchema.parse({
        kind: 'destination',
        purpose: 'meet-people',
        status: 'In plan',
        timing: { mode: 'dates', from: '2028-02-29', to: '2028-02-01' },
      })
    ).toMatchObject({ kind: 'destination', status: 'In plan' });
    for (const input of [
      { kind: 'city' },
      { status: 'Booked' },
      { purpose: 'holiday' },
      { timing: { mode: 'month', month: '2028-13' } },
      { timing: { mode: 'dates', from: '2027-02-29' } },
      { timing: { mode: 'dates', to: '2028-04-31' } },
    ])
      expect(IdeaInputSchema.safeParse(input).success).toBe(false);
    for (const timing of [{ mode: 'none' }, { mode: 'month' }, { mode: 'dates' }])
      expect(IdeaInputSchema.safeParse({ timing }).success).toBe(true);
  });
  it('retains unresolved canonical Contacts references and rejects references to other owners', () => {
    const contact = {
      uri: 'pops:contacts/contact/unavailable-owner-issued-id',
      label: 'Source label',
    };
    expect(
      IdeaInputSchema.parse({
        contactLinks: [contact],
        recommendations: [{ contact, note: 'Exact recommendation' }],
      })
    ).toMatchObject({ contactLinks: [contact] });
    for (const uri of [
      'https://example.test/person',
      'pops:documents/document/42',
      'pops:contacts/entity/missing',
      'pops:contacts/contact/',
    ]) {
      expect(IdeaInputSchema.safeParse({ contactLinks: [{ uri }] }).success).toBe(false);
      expect(
        IdeaInputSchema.safeParse({ recommendations: [{ contact: { uri }, note: '' }] }).success
      ).toBe(false);
    }
  });
  it('rejects a different command submitted through an action-specific scope', () => {
    const operation = {
      operationId: '65ab62cf-54b2-4fbf-9b44-b00f45398da7',
      command: { kind: 'capture.remove', id: 1, expectedRevision: 1 },
    };
    expect(capturesContract.remove.body.safeParse(operation).success).toBe(true);
    expect(capturesContract.update.body.safeParse(operation).success).toBe(false);
    expect(ideasContract.update.body.safeParse(operation).success).toBe(false);
  });
});
