import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagMerchantList, TagName, TagRuleList } from './tag-sources';

describe('TagName', () => {
  it('shows the facet ahead of the value', () => {
    render(<TagName tag="venue:pub" />);
    expect(screen.getByText('venue')).toBeInTheDocument();
    expect(screen.getByText('pub')).toBeInTheDocument();
  });

  it('shows a bare tag without a facet', () => {
    const { container } = render(<TagName tag="subscriptions" />);
    expect(screen.getByText('subscriptions')).toBeInTheDocument();
    expect(container.textContent).toBe('subscriptions');
  });
});

describe('TagRuleList', () => {
  it('says so when no rule applies the tag', () => {
    render(<TagRuleList rules={[]} />);
    expect(screen.getByText('No rule applies this tag.')).toBeInTheDocument();
  });

  it('lists each rule with an edit control, marking only the disabled one', () => {
    render(
      <TagRuleList
        rules={[
          { id: 'a', pattern: 'HARBOUR HOTEL', matchType: 'contains', isActive: true },
          { id: 'b', pattern: '^TAVERN', matchType: 'regex', isActive: false },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Edit rule HARBOUR HOTEL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit rule ^TAVERN' })).toBeInTheDocument();
    expect(screen.getAllByText('Disabled')).toHaveLength(1);
  });
});

describe('TagMerchantList', () => {
  it('says so when no merchant has the tag as a default', () => {
    render(<TagMerchantList merchants={[]} />);
    expect(screen.getByText('No merchant has it as a default tag.')).toBeInTheDocument();
  });

  it('lists each merchant with an edit control', () => {
    render(<TagMerchantList merchants={[{ id: 'm', name: 'The Anchor' }]} />);
    expect(screen.getByText('The Anchor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit The Anchor' })).toBeInTheDocument();
  });
});
