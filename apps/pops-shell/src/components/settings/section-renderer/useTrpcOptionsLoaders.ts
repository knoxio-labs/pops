import { trpc } from '@/lib/trpc';
import { useMemo } from 'react';

import type { SettingsManifest } from '@pops/types';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

function traverseClient(client: unknown, procedure: string): Record<string, unknown> {
  const parts = procedure.split('.');
  let current: unknown = client;
  for (const part of parts) {
    if (current == null || (typeof current !== 'object' && typeof current !== 'function')) {
      throw new Error(`Unknown procedure: ${procedure}`);
    }
    current = (current as Record<string, unknown>)[part];
    if (current == null) throw new Error(`Unknown procedure: ${procedure}`);
  }
  if (current == null || (typeof current !== 'object' && typeof current !== 'function')) {
    throw new Error(`Cannot call procedure: ${procedure}`);
  }
  return current as Record<string, unknown>;
}

export function useTrpcOptionsLoaders(manifest: SettingsManifest): Loaders {
  const utils = trpc.useUtils();

  return useMemo(() => {
    const loaders: Loaders = {};
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        if (!field.optionsLoader) continue;
        const { procedure, valueKey, labelKey } = field.optionsLoader;
        const key = field.key;
        loaders[key] = async () => {
          const node = traverseClient(utils.client, procedure);
          let raw: unknown;
          if (typeof node.query === 'function') {
            raw = await (node.query as () => Promise<unknown>)();
          } else {
            throw new Error(`Procedure is not a query: ${procedure}`);
          }
          const result = raw as { data?: Record<string, unknown>[] };
          const items = result?.data ?? [];
          return items.map((item) => ({
            value: String(item[valueKey]),
            label: String(item[labelKey]),
          }));
        };
      }
    }
    return loaders;
  }, [manifest, utils]);
}
