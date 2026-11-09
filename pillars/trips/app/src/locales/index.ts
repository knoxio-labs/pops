import enAU from './en-AU.json';
import ptBR from './pt-BR.json';

import type { RemotePillarI18n } from '@pops/pillar-sdk';

/** Trips-owned labels registered on the shell's shared i18next instance before mounting. */
export const i18n = {
  namespace: 'trips',
  resources: { 'en-AU': enAU, 'pt-BR': ptBR },
} satisfies RemotePillarI18n;
