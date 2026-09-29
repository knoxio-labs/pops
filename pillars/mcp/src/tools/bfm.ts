/** MCP tools backed by the BFM operator surface. */
import { getPillar } from '../pillar-client.js';
import { mapCallResult } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type BfmShape = {
  operator: {
    issuePairingCode: (input: Record<string, never>) => unknown;
  };
};

function bfm(): PillarHandle<BfmShape> {
  return getPillar<BfmShape>('bfm');
}

const issueDevicePairingCode: ToolDef = {
  name: 'bfm.devicePairing.issueCode',
  description:
    'Issue one short-lived, single-use device-pairing code for the iOS app. Returns only the code, pairing URL, and expiry; it never returns device credentials or lists devices.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  scope: 'bfm.operator.issuePairingCode',
  handler: async () =>
    mapCallResult(await bfm().operator.issuePairingCode({}), 'bfm.operator.issuePairingCode'),
};

/** The BFM-backed MCP tool surface. */
export const bfmTools: readonly ToolDef[] = [issueDevicePairingCode];
