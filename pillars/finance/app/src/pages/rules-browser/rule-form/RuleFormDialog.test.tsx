/**
 * Wiring check for the digit-stripping notice (POPS-2622): the unit tests in
 * `DigitPatternNotice.test.tsx` cover the detection, this covers that the
 * dialog feeds it the live pattern and match type as the user edits them.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { RuleFormDialog } from './RuleFormDialog';
import { DEFAULT_RULE_FORM_VALUES, type RuleFormValues } from './types';

function Harness() {
  const form = useForm<RuleFormValues>({ defaultValues: DEFAULT_RULE_FORM_VALUES });
  return (
    <RuleFormDialog
      open
      onOpenChange={vi.fn()}
      editingRule={null}
      form={form}
      isSubmitting={false}
      onSubmit={vi.fn()}
      entities={[]}
      preview={{
        data: undefined,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
        inputPattern: '',
        inputMatchType: 'contains',
        isIdle: true,
      }}
    />
  );
}

describe('RuleFormDialog digit notice', () => {
  it('warns once the pattern is a digit-dependent regex', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('e.g. WOOLWORTHS'), '\\d{4}');
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue('Contains'), 'regex');
    expect(screen.getByTestId('digit-pattern-notice')).toBeInTheDocument();
  });
});
