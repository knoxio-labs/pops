import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

import { SearchPage } from './SearchPage.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Inventory/Search/SearchPage',
  component: SearchPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SearchPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function SearchStory({ initialEntries }: { readonly initialEntries: readonly string[] }) {
  return (
    <MemoryRouter initialEntries={[...initialEntries]}>
      <QueryClientProvider client={new QueryClient()}>
        <SearchPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** The landing state exposes recent queries and opened inventory records. */
export const Recents: Story = {
  render: () => <SearchStory initialEntries={['/inventory/search']} />,
};

/** A deep-linked query starts in the loading state before the server responds. */
export const Query: Story = {
  render: () => <SearchStory initialEntries={['/inventory/search?q=lamp']} />,
};
