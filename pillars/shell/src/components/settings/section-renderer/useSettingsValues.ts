import { useState } from 'react';

import type { SettingsManifest } from '@pops/types';

interface UseSettingsValuesArgs {
  data: { settings: Record<string, string> } | undefined;
  manifest: SettingsManifest;
}

function withDefaults(
  settings: Record<string, string> | undefined,
  manifest: SettingsManifest
): Record<string, string> {
  const withDefaults: Record<string, string> = { ...settings };
  for (const group of manifest.groups) {
    for (const field of group.fields) {
      if (!(field.key in withDefaults) && field.default !== undefined) {
        withDefaults[field.key] = field.default;
      }
    }
  }
  return withDefaults;
}

export function useSettingsValues({ data, manifest }: UseSettingsValuesArgs) {
  const [loadedSettings, setLoadedSettings] = useState(data?.settings);
  const [values, setValues] = useState<Record<string, string>>(() =>
    withDefaults(data?.settings, manifest)
  );

  if (data?.settings !== loadedSettings) {
    setLoadedSettings(data?.settings);
    setValues(withDefaults(data?.settings, manifest));
  }

  return { values, setValues, loadedKeys: data?.settings ?? {} };
}
