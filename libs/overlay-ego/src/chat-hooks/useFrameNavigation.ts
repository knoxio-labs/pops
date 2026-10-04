import { useCallback } from 'react';

import { useSearchResultNavigation } from '@pops/navigation';

/** Routes stream navigation frames; an unresolvable URI is a silent no-op. */
export function useFrameNavigation(): (uri: string) => void {
  const { navigateTo } = useSearchResultNavigation();

  return useCallback(
    (uri: string) => {
      void navigateTo(uri);
    },
    [navigateTo]
  );
}
