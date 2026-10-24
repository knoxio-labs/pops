import { useEffect } from 'react';

import type { LabelParams } from './label-params';
import type { LabelSubjects } from './useLabelSubjects';

/**
 * `contents=1` prints each listed box with what is in it: once the boxes'
 * contents are known they are written into `ids`, which stays the one
 * record of what the job holds.
 */
export function useExpandLabelContents(
  params: LabelParams,
  data: LabelSubjects,
  setIds: (ids: string[], dropContents: boolean) => void
) {
  useEffect(() => {
    if (
      !params.contents ||
      data.isLoading ||
      data.contentsLoading ||
      data.error ||
      data.contentsError
    )
      return;
    const expanded = params.ids.flatMap((id) => [
      id,
      ...(data.contents.get(id) ?? []).map((held) => held.id),
    ]);
    setIds(expanded, true);
  }, [
    params.contents,
    params.ids,
    data.isLoading,
    data.contentsLoading,
    data.contents,
    data.error,
    data.contentsError,
    setIds,
  ]);
}
