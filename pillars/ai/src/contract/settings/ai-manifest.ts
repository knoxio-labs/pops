import type { SettingsManifest } from '@pops/types';

export const aiConfigManifest: SettingsManifest = {
  id: 'ai.config',
  title: 'AI Configuration',
  icon: 'Bot',
  order: 200,
  groups: [
    {
      id: 'budget',
      title: 'Budget',
      fields: [
        {
          key: 'ai.monthlyTokenBudget',
          label: 'Monthly Token Budget',
          type: 'number',
          description: 'Maximum tokens to use per month. Leave empty for no limit.',
          validation: { min: 0 },
        },
        {
          key: 'ai.budgetExceededFallback',
          label: 'When Budget Exceeded',
          type: 'select',
          default: 'skip',
          options: [
            { value: 'skip', label: 'Skip requests' },
            { value: 'alert', label: 'Alert and continue' },
          ],
        },
      ],
    },
    {
      id: 'retention',
      title: 'Log Retention',
      fields: [
        {
          key: 'ai.logRetentionDays',
          label: 'Inference Log Retention (days)',
          type: 'number',
          description:
            'How many days of raw `ai_inference_log` rows to keep. Older rows are aggregated into `ai_inference_daily` and removed by the nightly retention job.',
          default: '90',
          validation: { min: 1 },
        },
      ],
    },
  ],
};
