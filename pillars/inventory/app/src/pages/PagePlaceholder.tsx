import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/** Renders the title and pending message for an inventory page not built yet. */
export function PagePlaceholder({ title }: { title: string }): ReactElement {
  const { t } = useTranslation('inventory');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-muted-foreground">{t('pagePending')}</p>
    </div>
  );
}
