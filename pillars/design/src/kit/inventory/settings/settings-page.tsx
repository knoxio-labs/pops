import { HintTooltip, ShortcutHint } from '@/kit/inventory/foundation';
import { InventoryPage, OFFLINE_REASON, PageStateBanner } from '@/kit/inventory/secondary-page';
/**
 * `/inventory/settings`: Paperless, codes, label defaults and list density
 * on one screen, two columns, no scrolling. Changes collect until Save; the
 * footer says how many are waiting and why Save is off when it is.
 */
import { Settings } from 'lucide-react';
import { useReducer } from 'react';

import { Button, Skeleton } from '@pops/ui';

import { CodesSection } from './codes-section';
import { LabelsSection, ListsSection } from './defaults-section';
import { PaperlessSection } from './paperless-section';
import { dirtyKeys, saveBlocker, settingsReducer } from './settings-model';

import type { PageBanner } from '@/kit/inventory/secondary-page';

import type { InventorySettings, SettingsState } from './settings-model';

/** Props for {@link SettingsPage}. */
export interface SettingsPageProps {
  initial: SettingsState;
  status?: 'ready' | 'loading';
  banner?: PageBanner;
  onOpenLabels?: () => void;
}

function Footer({
  state,
  blocked,
  onDiscard,
  onSave,
}: {
  state: SettingsState;
  blocked: string | null;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const dirty = dirtyKeys(state).length;
  const summary = () => {
    if (state.justSaved) return 'Saved. New items and lists use these from now on.';
    if (dirty === 0) return 'No unsaved changes.';
    return dirty === 1 ? '1 unsaved change.' : `${dirty} unsaved changes.`;
  };
  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 rounded-lg border bg-card px-4">
      <p role="status" className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {summary()}
      </p>
      <Button variant="outline" disabled={dirty === 0} onClick={onDiscard}>
        Discard
      </Button>
      <HintTooltip
        label="Save settings"
        shortcutId="form-save"
        disabledReason={dirty === 0 ? undefined : (blocked ?? undefined)}
      >
        <Button
          aria-disabled={blocked !== null || undefined}
          className={blocked === null ? undefined : 'opacity-50'}
          onClick={blocked === null ? onSave : undefined}
          suffix={
            <ShortcutHint
              id="form-save"
              className="[&_kbd]:border-primary-foreground/30 [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground"
            />
          }
        >
          Save
        </Button>
      </HintTooltip>
    </footer>
  );
}

/** The settings page. */
export function SettingsPage(props: SettingsPageProps) {
  const [state, dispatch] = useReducer(settingsReducer, props.initial);
  const offline = props.banner === 'offline';
  const blocked = offline ? OFFLINE_REASON : saveBlocker(state);
  const edit = (patch: Partial<InventorySettings>) => dispatch({ type: 'edit', patch });
  return (
    <InventoryPage
      icon={Settings}
      title="Settings"
      description="How Inventory talks to Paperless, suggests codes and lays out labels and lists."
      banner={<PageStateBanner banner={props.banner} what="Settings" />}
    >
      {props.status === 'loading' ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4" aria-busy="true">
          <Skeleton className="h-full rounded-lg" />
          <Skeleton className="h-full rounded-lg" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <PaperlessSection
                state={state}
                locked={offline ? OFFLINE_REASON : undefined}
                onUrl={(paperlessUrl) => edit({ paperlessUrl })}
                onTest={() => dispatch({ type: 'test-start' })}
              />
              <LabelsSection state={state} onChange={edit} onOpenLabels={props.onOpenLabels} />
            </div>
            <div className="flex flex-col gap-4">
              <CodesSection
                state={state}
                onToggle={(suggestCodes) => edit({ suggestCodes })}
                onPattern={(codePattern) => edit({ codePattern })}
              />
              <ListsSection state={state} onChange={edit} />
            </div>
          </div>
          <Footer
            state={state}
            blocked={blocked}
            onDiscard={() => dispatch({ type: 'discard' })}
            onSave={() => dispatch({ type: 'save' })}
          />
        </div>
      )}
    </InventoryPage>
  );
}
