/**
 * Modules `src/index.ts` exports a component from that no story imports yet.
 *
 * Every entry is a debt, not a decision: the story-coverage half of
 * `check-storybook-coverage.mjs` fails when a module listed here gains a story
 * (the entry is then stale) and when a module listed here stops being
 * exported. Adding an entry is how you take debt on knowingly; there is no way
 * to silence the guard without one, and `scripts/__tests__/` pins this list's
 * size so a new entry cannot land without also editing that number.
 *
 * Keys are `libs/ui/src`-relative paths. Values say why the module has no
 * story yet. The uniform reason below is the honest one for this batch: they
 * are the modules that were already unstoried on the day the gate landed.
 *
 * @type {Record<string, string>}
 */
export const STORY_COVERAGE_ALLOWLIST = {
  'components/ActionButtonWithDetailPicker.tsx': 'Predates the story-coverage gate.',
  'components/BreakdownChart.tsx': 'Predates the story-coverage gate.',
  'components/ContainerPanel.tsx': 'Predates the story-coverage gate.',
  'components/DurationFieldInput.tsx': 'Predates the story-coverage gate.',
  'components/EmptyState.tsx': 'Predates the story-coverage gate.',
  'components/ErrorBoundary.tsx': 'Predates the story-coverage gate.',
  'components/FileUpload.tsx': 'Predates the story-coverage gate.',
  'components/ImageGallery.tsx': 'Predates the story-coverage gate.',
  'components/ImageWithFallback.tsx': 'Predates the story-coverage gate.',
  'components/MediaCard.tsx': 'Predates the story-coverage gate.',
  'components/RadarChart.tsx': 'Predates the story-coverage gate.',
  'components/RelatedItemsList.tsx': 'Predates the story-coverage gate.',
  'components/ResponsiveCardGrid.tsx': 'Predates the story-coverage gate.',
  'components/ScrollShelf.tsx': 'Predates the story-coverage gate.',
  'components/SearchPickerDialog.tsx': 'Predates the story-coverage gate.',
  'components/SettingsForm.tsx': 'Predates the story-coverage gate.',
  'components/SortableGrid.tsx': 'Predates the story-coverage gate.',
  'components/TierListBoard.tsx': 'Predates the story-coverage gate.',
  'components/TreePicker.tsx': 'Predates the story-coverage gate.',
  'components/TreeView.tsx': 'Predates the story-coverage gate.',
  'components/UriCard.tsx': 'Predates the story-coverage gate.',
  'components/WarrantyBadge.tsx': 'Predates the story-coverage gate.',
  'primitives/alert-dialog.tsx': 'Predates the story-coverage gate.',
  'primitives/button.tsx': 'Predates the story-coverage gate.',
  'primitives/collapsible.tsx': 'Predates the story-coverage gate.',
  'primitives/command.tsx': 'Predates the story-coverage gate.',
  'primitives/dropdown-menu.tsx': 'Predates the story-coverage gate.',
  'primitives/input.tsx': 'Predates the story-coverage gate.',
  'primitives/label.tsx': 'Predates the story-coverage gate.',
  'primitives/popover.tsx': 'Predates the story-coverage gate.',
  'primitives/radio-group.tsx': 'Predates the story-coverage gate.',
  'primitives/select.tsx': 'Predates the story-coverage gate.',
  'primitives/table.tsx': 'Predates the story-coverage gate.',
};
