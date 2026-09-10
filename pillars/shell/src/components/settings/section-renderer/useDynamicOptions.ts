import { useEffect, useMemo, useState } from 'react';

type Options = { value: string; label: string }[];
type Loaders = Record<string, () => Promise<Options>>;

export function useDynamicOptions(optionsLoaders?: Loaders) {
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Options>>({});
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!optionsLoaders) return;
    let cancelled = false;

    for (const [key, loader] of Object.entries(optionsLoaders)) {
      Promise.resolve()
        .then(loader)
        .then((opts) => {
          if (!cancelled) setDynamicOptions((prev) => ({ ...prev, [key]: opts }));
        })
        .catch(() => {
          if (!cancelled) setFailedKeys((prev) => new Set([...prev, key]));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [optionsLoaders]);

  const loadingOptionKeys = useMemo(() => {
    const loading = new Set<string>();
    if (!optionsLoaders) return loading;
    for (const key of Object.keys(optionsLoaders)) {
      if (key in dynamicOptions) continue;
      if (failedKeys.has(key)) continue;
      loading.add(key);
    }
    return loading;
  }, [optionsLoaders, dynamicOptions, failedKeys]);

  return { dynamicOptions, loadingOptionKeys };
}
