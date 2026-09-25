/**
 * Settings, Labels and Lists: the sheet and template the label page opens
 * with (the label page itself is reached from a selection or an item, not
 * the nav), and the row density every list starts in.
 */
import { Printer } from 'lucide-react';

import { describeLayout, SHEET_PRESETS } from '@pops/inventory/labels';
import { Button, Select, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { SettingRow, SettingsCard } from './settings-parts';

import type { InventorySettings, SettingsState } from './settings-model';

const TEMPLATES: readonly { value: InventorySettings['labelTemplate']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'container', label: 'Box' },
  { value: 'item', label: 'Item' },
];

/** The labels card. */
export function LabelsSection({
  state,
  onChange,
  onOpenLabels,
}: {
  state: SettingsState;
  onChange: (patch: Partial<InventorySettings>) => void;
  onOpenLabels?: () => void;
}) {
  return (
    <SettingsCard
      title="Labels"
      description="What the label page starts with. Each print can still change it."
      action={
        <Button
          variant="ghost"
          size="sm"
          className="-mt-1 -mr-2 shrink-0"
          prefix={<Printer className="size-4" aria-hidden />}
          onClick={onOpenLabels}
        >
          Label page
        </Button>
      }
    >
      <Select
        label="Sheet"
        value={state.draft.labelSheetId}
        options={SHEET_PRESETS.map((layout) => ({
          value: layout.id,
          label: describeLayout(layout),
        }))}
        onChange={(event) => onChange({ labelSheetId: event.target.value })}
      />
      <SettingRow
        label="Template"
        hint="Auto gives boxes the box label and everything else the item label."
      >
        <Tabs
          value={state.draft.labelTemplate}
          onValueChange={(value) => {
            const found = TEMPLATES.find((entry) => entry.value === value);
            if (found) onChange({ labelTemplate: found.value });
          }}
        >
          <TabsList aria-label="Template">
            {TEMPLATES.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="flex-none px-3">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </SettingRow>
    </SettingsCard>
  );
}

/** The lists card. */
export function ListsSection({
  state,
  onChange,
}: {
  state: SettingsState;
  onChange: (patch: Partial<InventorySettings>) => void;
}) {
  return (
    <SettingsCard
      title="Lists"
      description="How tall rows are in Items, Containers, search and every other list."
    >
      <SettingRow label="Row density" hint="Compact rows are 36 px tall, comfortable rows 44 px.">
        <Tabs
          value={state.draft.density}
          onValueChange={(value) =>
            onChange({ density: value === 'comfortable' ? 'comfortable' : 'compact' })
          }
        >
          <TabsList aria-label="Row density">
            <TabsTrigger value="compact" className="flex-none px-3">
              Compact
            </TabsTrigger>
            <TabsTrigger value="comfortable" className="flex-none px-3">
              Comfortable
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SettingRow>
    </SettingsCard>
  );
}
