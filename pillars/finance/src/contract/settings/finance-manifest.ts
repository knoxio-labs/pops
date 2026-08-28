/**
 * Finance settings manifest — AI categorizer and pagination defaults.
 */
import type { SettingsManifest } from '@pops/types';

export const financeManifest: SettingsManifest = {
  id: 'finance',
  title: 'Finance',
  icon: 'DollarSign',
  order: 140,
  groups: [
    {
      id: 'aiCategorizer',
      title: 'AI Categorizer',
      description: 'Model and limits for AI-powered transaction categorisation.',
      fields: [
        {
          key: 'finance.aiCategorizer.model',
          label: 'Categorizer Model',
          type: 'text',
          default: 'claude-haiku-4-5-20251001',
          description:
            'Anthropic model id, passed through verbatim. Categorisation is a short lookup-shaped task, so the cheapest current model is the sensible default; a larger model costs more per imported row without matching entities much better.',
        },
        {
          key: 'finance.aiCategorizer.maxTokens',
          label: 'Max Tokens',
          type: 'number',
          default: '200',
          description:
            'Cap on the reply for one transaction, not a target — the answer is a short JSON object of entity plus tags, so 200 already leaves headroom and raising it buys no accuracy. The floor of 50 is where a reply starts getting truncated mid-object: a cut-off reply is unparseable and the row is left uncertain. The ceiling of 2000 is a cost guard, since output tokens are the expensive half of the call and every imported row pays it.',
          validation: {
            min: 50,
            max: 2000,
            message:
              'Use 50-2000. Below 50 the reply is truncated and the row stays uncertain; above 2000 you only pay more for the same answer.',
          },
        },
        {
          key: 'finance.ruleGen.model',
          label: 'Rule Generation Model',
          type: 'text',
          default: 'claude-haiku-4-5-20251001',
          description:
            'Anthropic model id used when your manual corrections are analysed for a repeatable rule. Runs once per analysis rather than once per row, so a larger model here is far cheaper than on the categorizer.',
        },
        {
          key: 'finance.ruleGen.maxTokens',
          label: 'Rule Gen Max Tokens',
          type: 'number',
          default: '200',
          description:
            'Cap on the reply when the model proposes a rule from your corrections. A proposal is a match pattern and a target entity, so the bounds are the categorizer ones for the same reasons: under 50 the proposal is truncated and discarded, over 2000 you are paying for headroom a few lines of rule will never use.',
          validation: {
            min: 50,
            max: 2000,
            message:
              'Use 50-2000. Below 50 the proposal is truncated and discarded; above 2000 you only pay more for the same answer.',
          },
        },
      ],
    },
    {
      id: 'financePagination',
      title: 'Pagination',
      description: 'Default page sizes for finance list endpoints.',
      fields: [
        {
          key: 'finance.defaultLimit',
          label: 'Default Page Size',
          type: 'number',
          default: '50',
          description: 'Default page size for transactions, budgets, and wishlist.',
          validation: { min: 1, max: 200 },
        },
      ],
    },
  ],
};
