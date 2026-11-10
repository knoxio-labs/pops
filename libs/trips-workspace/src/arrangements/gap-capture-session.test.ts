import { expect, it } from 'vitest';

import { sourceStay } from '../stay/test-utils';
import { GapCaptureSession } from './gap-capture-session';

it('owns the original known identity and explicit intent independently of mutable input aliases', () => {
  const session = new GapCaptureSession();
  const intent = { visitId: 31, arrival: '2030-04-10', departure: '2030-04-16' };
  const source = sourceStay({ id: 17 });
  session.update({ kind: 'acknowledged', intent, source });
  intent.visitId = 32;
  source.id = 99;
  const retained = session.select({ visitId: 31, arrival: '2030-04-10', departure: '2030-04-16' });
  if (retained.kind !== 'acknowledged') throw new Error('Expected the exact known source receipt');
  expect(retained.source.id).toBe(17);
  expect(retained.intent.visitId).toBe(31);
  expect(() => {
    retained.source.id = 88;
  }).toThrow(TypeError);
  expect(session.select(intent).kind).toBe('ready');
});
