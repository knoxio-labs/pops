# @pops/navigation

The shared frontend chrome that sits between the shell and the pillar apps it lazy-loads: the global search surface (input, dropdown, results panel, mobile overlay, recent searches, keyboard nav, focus trap), the app-context provider that tracks which app and page the user is on, and the `pops:{pillar}/{type}/{id}` → route resolver that makes a search hit clickable.

Despite the name it holds no navigation _config_ — nav entries and routes come from each pillar's registry manifest. What lives here is the code both sides need and neither may own: the shell cannot import a pillar app, and a pillar app cannot import the shell.

## Who depends on it

| Consumer                                    | Uses                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pillars/shell`                             | `AppContextProvider` at the app root; one-line re-export shims for `SearchInput` and `MobileSearchOverlay` under `src/app/layout/` and for `useSearchStore` in `src/store/searchStore.ts`; `IconName` |
| `finance/app`, `media/app`, `inventory/app` | `registerResultComponent` (side-effect at bundle load), `ResultComponentProps`, `useSetPageContext`, `IconName`                                                                                       |
| `ai/app`, `cerebrum/app`                    | `IconName` only                                                                                                                                                                                       |

## Constraints

- **A lib may never import a pillar** (`scripts/ci/check-lib-no-pillar-import.mjs`). Its workspace dependencies are `@pops/ui`, `@pops/module-registry` and `@pops/pillar-sdk` (the `PillarId` type only); its third-party runtime dependencies are `react`, `react-router`, `@tanstack/react-query`, `zustand` and `lucide-react`.
- **No build step, browser only.** `main` and `exports` point straight at `src/index.ts` and there is no `build` task — consumers transpile the source through their own bundler. Nothing on the Node side can import it.
- **`IconName` is a closed union with an external obligation.** The shell's `icon-map.ts` asserts `satisfies Record<IconName, LucideIcon>`, so adding a name here without adding the Lucide import there breaks the shell's typecheck, not this package's.

## What first-time consumers get wrong

- **The result-component registry is populated by import side-effect.** A pillar app registers its renderers when its bundle loads. Until then — or if the bundle never loads — hits for that domain render through `GenericResultComponent`, which prints the first string field it finds. Nothing warns.
- **Search needs the shell's proxy.** `useSearchInputData` posts to `/orchestrator-api/search`, a path the dev Vite proxy and production nginx rewrite onto the orchestrator's `POST /search`. Rendering `SearchInput` from a standalone pillar app dev server yields no results, and the failure looks like an empty query.
- **`AppContextProvider` must be inside a react-router `Router`** — see the docblock in `src/AppContextProvider.tsx`.
- **`_clearRegistry` is a test hook on the public barrel.** It is exported for suites that need registry isolation; production code should never call it.
