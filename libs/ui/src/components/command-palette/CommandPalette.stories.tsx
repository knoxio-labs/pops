import { Archive, Box, FileText, MapPin, MoveRight, Plus } from 'lucide-react';

import { CommandPalettePanel } from './CommandPalette';
import { rankEntries } from './palette-rank';
import { initialPaletteState } from './palette-state';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { PaletteCommand, PaletteSection, PaletteSource } from './types';

const move = {
  id: 'move',
  label: 'Move',
  group: 'commands',
  icon: MoveRight,
  argument: 'destination',
} satisfies PaletteCommand;
const create = {
  id: 'create',
  label: 'Create note',
  group: 'commands',
  icon: Plus,
} satisfies PaletteCommand;
const recent = {
  id: 'recent-note',
  label: 'Cable notes',
  group: 'recents',
  icon: FileText,
  detail: 'Opened recently',
} satisfies PaletteCommand;
const record = {
  id: 'record-cable',
  label: 'Cable organiser',
  group: 'records',
  icon: Box,
  keywords: ['desk', 'storage'],
} satisfies PaletteCommand;
const place = {
  id: 'place-desk',
  label: 'Desk drawer',
  group: 'records',
  icon: MapPin,
} satisfies PaletteCommand;
const destination = {
  id: 'destination-desk',
  label: 'Desk drawer',
  group: 'destinations',
  icon: MapPin,
} satisfies PaletteCommand;
const seeAll = {
  id: 'see-all',
  label: 'See all matches',
  group: 'search',
  icon: Archive,
} satisfies PaletteCommand;

const scopes = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'archive', label: 'Archive' },
] as const;

function nonEmptySections(sections: PaletteSection[]): PaletteSection[] {
  return sections.filter((section) => section.entries.length > 0);
}

const source: PaletteSource = {
  scopes,
  commands: [move, create],
  sections: (query, scope, step) => {
    if (step !== null) {
      return [
        {
          id: 'destinations',
          title: step.label,
          entries: rankEntries(query, [destination]),
        },
      ];
    }
    if (query.trim() === 'zzz') return [];
    if (scope === 'archive') {
      return nonEmptySections([
        { id: 'records', title: 'Records', entries: rankEntries(query, [record]) },
      ]);
    }
    if (query.trim() === '') {
      return [
        { id: 'recents', title: 'Recent', entries: [recent] },
        { id: 'records', title: 'Records', entries: [record, place] },
        { id: 'commands', title: 'Commands', entries: [move, create] },
      ];
    }
    return nonEmptySections([
      { id: 'records', title: 'Records', entries: rankEntries(query, [record, place]) },
      { id: 'commands', title: 'Commands', entries: rankEntries(query, [move, create]) },
    ]);
  },
  seeAll: (query, _scope, step) => (query.trim() === '' || step !== null ? null : seeAll),
  placeholder: (scope, step) => {
    if (step !== null) return `Choose a ${step.argument}`;
    return scope === 'archive' ? 'Search the archive' : 'Search the workspace';
  },
};

const meta = {
  title: 'Navigation/CommandPalette',
  component: CommandPalettePanel,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CommandPalettePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyQuery: Story = {
  args: { source },
  render: () => <CommandPalettePanel source={source} />,
};

export const Results: Story = {
  args: { source },
  render: () => (
    <CommandPalettePanel
      source={source}
      initial={{ ...initialPaletteState('workspace'), query: 'cable' }}
    />
  ),
};

export const ArgumentStep: Story = {
  args: { source },
  render: () => (
    <CommandPalettePanel
      source={source}
      initial={{
        ...initialPaletteState('workspace'),
        steps: [{ commandId: 'move', label: 'Move', argument: 'destination' }],
      }}
      subject="2 notes"
    />
  ),
};

export const NoResults: Story = {
  args: { source },
  render: () => (
    <CommandPalettePanel
      source={source}
      initial={{ ...initialPaletteState('workspace'), query: 'zzz' }}
    />
  ),
};
