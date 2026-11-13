import { unwrap } from '../../../bfm-api-helpers.js';
import { operatorGetDeviceGrant, operatorReplaceDeviceGrant } from '../../../bfm-api/index.js';
import { grantFailure } from './grant-failures.js';
import { initialSelection, projectSelection } from './grant-selection.js';

import type { GrantSession } from './types.js';

/** Performs one explicit request per action; a sequence token discards responses from dismissed sessions. */
export function createGrantRequests(
  current: () => GrantSession,
  update: (state: GrantSession) => void,
  sequence: { current: number },
  busy: { current: boolean }
) {
  const read = async () => {
    const session = current();
    if (!session.open || !session.target || busy.current) return;
    const token = ++sequence.current;
    update({
      ...session,
      phase: 'loading',
      grant: null,
      selection: [],
      failure: null,
      saved: false,
    });
    try {
      const grant = unwrap(await operatorGetDeviceGrant({ path: { id: session.target.id } }));
      if (token !== sequence.current) return;
      update({ ...current(), phase: 'ready', grant, selection: initialSelection(grant) });
    } catch (error) {
      if (token !== sequence.current) return;
      update({ ...current(), phase: 'failed', failure: grantFailure(error, false) });
    }
  };
  return { read, save: createGrantSave(current, update, sequence, busy) };
}

function createGrantSave(
  current: () => GrantSession,
  update: (state: GrantSession) => void,
  sequence: { current: number },
  busy: { current: boolean }
) {
  return async () => {
    const session = current();
    if (
      !session.open ||
      !session.target ||
      !session.grant ||
      session.phase !== 'ready' ||
      session.failure ||
      busy.current
    )
      return;
    const projection = projectSelection(session.grant, session.selection);
    if (projection.unavailable.length > 0 || !projection.changed) return;
    busy.current = true;
    const token = ++sequence.current;
    update({ ...session, phase: 'saving', saved: false });
    try {
      const grant = unwrap(
        await operatorReplaceDeviceGrant({
          path: { id: session.target.id },
          body: {
            expectedRevision: session.grant.revision,
            expectedPolicyToken: session.grant.policyToken,
            capabilities: projection.capabilities,
          },
        })
      );
      if (token !== sequence.current) return;
      update({
        ...current(),
        phase: 'ready',
        grant,
        selection: initialSelection(grant),
        saved: true,
      });
    } catch (error) {
      if (token !== sequence.current) return;
      update({ ...current(), phase: 'failed', failure: grantFailure(error, true) });
    } finally {
      busy.current = false;
    }
  };
}
