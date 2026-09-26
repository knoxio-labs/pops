import { OFFLINE_REASON, StateBanner } from '@/kit/inventory/foundation';
import { SectionRenderer } from '@/kit/shell-settings/section-renderer';
import { SettingsApp } from '@/kit/shell-settings/settings-app';
/**
 * Inventory's section of the Settings app, composed: the shell's section
 * renderer over the designed manifest, with the Paperless widget in its
 * slot. Saving is the Settings app's own (each field on change), so the
 * section has no Save or Discard; a test resolves to what the review state
 * says Paperless would answer.
 */
import { useReducer } from 'react';

import { inventorySettingsSection, PAPERLESS_WIDGET_SLOT } from './inventory-settings-manifest';
import { PaperlessWidget } from './paperless-widget';
import { sectionReducer } from './settings-section-model';

import type { PaperlessAnswer } from './paperless-widget';
import type { SectionState } from './settings-section-model';

const SAVE_MS = 600;
const TEST_MS = 1200;

/** Props for {@link InventorySettings}. */
export interface InventorySettingsProps {
  initial: SectionState;
  tokenStored: boolean;
  /** What a test answers. */
  testAnswer: PaperlessAnswer;
  status?: 'ready' | 'loading' | 'offline';
}

/** The Settings app open on Inventory. */
export function InventorySettings(props: InventorySettingsProps) {
  const [state, dispatch] = useReducer(sectionReducer, props.initial);
  const offline = props.status === 'offline';
  const change = (key: string, value: string) => {
    dispatch({ type: 'change', key, value });
    window.setTimeout(() => dispatch({ type: 'saved', key }), SAVE_MS);
  };
  const test = () => {
    dispatch({ type: 'test-start' });
    window.setTimeout(() => dispatch({ type: 'test-result', status: props.testAnswer }), TEST_MS);
  };
  return (
    <SettingsApp
      section={inventorySettingsSection}
      loading={props.status === 'loading'}
      banner={
        offline ? (
          <StateBanner
            kind="offline"
            title="No connection. Showing the settings as they last loaded."
            detail="Changes are off until it is back."
            className="mb-4"
          />
        ) : null
      }
    >
      <SectionRenderer
        manifest={inventorySettingsSection}
        values={state.values}
        drafts={state.drafts}
        saveStates={state.saveStates}
        locked={offline}
        onChange={change}
        widgets={{
          [PAPERLESS_WIDGET_SLOT]: (
            <PaperlessWidget
              status={state.paperless}
              tokenStored={props.tokenStored}
              locked={offline ? OFFLINE_REASON : undefined}
              onTest={test}
            />
          ),
        }}
      />
    </SettingsApp>
  );
}
