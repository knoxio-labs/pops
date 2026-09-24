import enAU from './en-AU.json';
import ptBR from './pt-BR.json';

import type { RemotePillarI18n } from '@pops/pillar-sdk';

/**
 * This app's translations, under the `cerebrum` namespace its components read
 * through `useTranslation('cerebrum')`. The remote entry exports it, and the
 * shell's loader registers it before mounting any of this app's pages.
 */
export const i18n = {
  namespace: 'cerebrum',
  resources: { 'en-AU': enAU, 'pt-BR': ptBR },
} satisfies RemotePillarI18n;
