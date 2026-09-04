import { AccountChip } from './AccountChip';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { AccountOption } from './account-shared/types';

const meta: Meta<typeof AccountChip> = {
  title: 'Data Display/AccountChip',
  component: AccountChip,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const WITH_INSTITUTION: AccountOption = {
  id: 'a1',
  name: 'Everyday',
  kind: 'checking',
  institution: { id: 'anz', name: 'ANZ', colour: '#0072ac' },
};

const NO_INSTITUTION: AccountOption = { id: 'a2', name: 'Wallet', kind: 'cash' };

export const Compact: Story = { args: { account: WITH_INSTITUTION } };

export const Inline: Story = { args: { account: WITH_INSTITUTION, size: 'inline' } };

export const Full: Story = { args: { account: WITH_INSTITUTION, size: 'full' } };

export const Archived: Story = { args: { account: { ...WITH_INSTITUTION, archived: true } } };

export const NoInstitutionFallsBackToKindIcon: Story = { args: { account: NO_INSTITUTION } };
