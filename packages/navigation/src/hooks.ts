import { useContext, useEffect } from "react";
import { AppContextCtx } from "./context.js";
import type { AppContext, AppContextEntity } from "./types.js";

/**
 * Returns the current AppContext.
 *
 * Must be used inside an AppContextProvider.
 */
export function useAppContext(): AppContext {
  return useContext(AppContextCtx).context;
}

/** Options accepted by useSetPageContext. */
export interface SetPageContextOptions {
  page: string;
  pageType?: AppContext["pageType"];
  entity?: AppContextEntity;
  filters?: Record<string, string>;
}

/**
 * Sets page-level context on mount and clears it on unmount.
 *
 * Call this from any page component to register its identity with the
 * global AppContext. The provider automatically clears on navigation,
 * and this hook also clears on unmount for safety.
 */
export function useSetPageContext(options: SetPageContextOptions): void {
  const { setPageContext } = useContext(AppContextCtx);

  useEffect(() => {
    setPageContext({
      page: options.page,
      pageType: options.pageType ?? "top-level",
      entity: options.entity,
      filters: options.filters,
    });

    return () => {
      setPageContext({ page: null, pageType: "top-level", entity: undefined, filters: undefined });
    };
    // Re-run when any option value changes
  }, [options.page, options.pageType, options.entity, options.filters, setPageContext]);
}
