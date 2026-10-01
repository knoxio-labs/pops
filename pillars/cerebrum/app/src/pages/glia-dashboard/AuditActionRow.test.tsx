import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@pops/ui';

import { AuditActionRow } from './AuditActionRow';

import type { GliaAction } from '../../glia/types';

const affectedIds = ['eng_1', 'eng_2', 'eng_3', 'eng_4', 'eng_5'];

const action: GliaAction = {
  id: 'act_1',
  actionType: 'prune',
  affectedIds,
  rationale: 'stale',
  phase: 'propose',
  status: 'pending',
  userDecision: 'approve',
  userNote: null,
  executedAt: null,
  decidedAt: null,
  revertedAt: null,
  createdAt: '2026-05-11T01:00:00Z',
};

describe('AuditActionRow', () => {
  it('opens the full affected ID list from the disclosure button', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <table>
          <tbody>
            <AuditActionRow action={action} />
          </tbody>
        </table>
      </TooltipProvider>
    );

    const disclosure = screen.getByTestId('glia-audit-affected-more');
    expect(disclosure).toHaveTextContent('eng_1, eng_2, eng_3 +2 more');
    await user.click(disclosure);

    expect(await screen.findByRole('dialog')).toHaveTextContent(affectedIds.join(', '));
  });
});
