import {
  UP_SYNC_DEFAULT_ENABLED,
  UP_SYNC_DEFAULT_INTERVAL_MINUTES,
  UP_SYNC_ENABLED_KEY,
  UP_SYNC_INTERVAL_KEY,
  UP_SYNC_MAX_INTERVAL_MINUTES,
  UP_SYNC_MIN_INTERVAL_MINUTES,
} from './up-sync-keys.js';

/**
 * Finance settings manifest — AI categorizer, pagination and Up sync defaults.
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
      id: 'upSync',
      title: 'Up Bank sync',
      description:
        'Scheduled pull of every account fed by the Up API. Each account still needs its own import config naming the Up account and the secret holding the token.',
      fields: [
        {
          key: UP_SYNC_ENABLED_KEY,
          label: 'Scheduled sync',
          type: 'toggle',
          default: String(UP_SYNC_DEFAULT_ENABLED),
          description:
            'Off by default because a sync with no token has nothing to do. Turning it on takes effect within a minute; turning it off lets a sync already in flight finish.',
        },
        {
          key: UP_SYNC_INTERVAL_KEY,
          label: 'Sync interval (minutes)',
          type: 'number',
          default: String(UP_SYNC_DEFAULT_INTERVAL_MINUTES),
          description:
            'Minutes between passes. Up settles held transactions overnight, so a few passes a day catch both the new rows and the settlements; below five minutes only spends API quota on an account that has not changed.',
          validation: {
            min: UP_SYNC_MIN_INTERVAL_MINUTES,
            max: UP_SYNC_MAX_INTERVAL_MINUTES,
            message: 'Use 5-1440 minutes.',
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
