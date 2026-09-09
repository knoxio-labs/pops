import { LISTS_PAGES } from '@pops/lists/manifest';

/**
 * Shape of one page in `LISTS_PAGES`, restated so the flatten below can walk
 * it without importing the SDK's schema types into a test helper.
 */
interface PageNode {
  readonly path: string;
  readonly index?: boolean;
  readonly bundleSlot: string;
  readonly children?: readonly PageNode[];
}

/**
 * Every slot in the page tree, nested tabs included.
 *
 * `LISTS_PAGES.length` counts only the top level, so a test written against it
 * would silently skip the eight `data` tabs — which is most of what POPS-3256
 * added and exactly the part most likely to break.
 */
export function allPageSlots(pages: readonly PageNode[] = LISTS_PAGES): string[] {
  return pages.flatMap((page) => [
    page.bundleSlot,
    ...(page.children === undefined ? [] : allPageSlots(page.children)),
  ]);
}

/** Every page in the tree, flattened, for tests that need more than the slot. */
export function allPages(pages: readonly PageNode[] = LISTS_PAGES): PageNode[] {
  return pages.flatMap((page) => [
    page,
    ...(page.children === undefined ? [] : allPages(page.children)),
  ]);
}
