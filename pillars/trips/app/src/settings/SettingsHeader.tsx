import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { tripTitle } from '../home/model';

import type { useTripEditor } from './use-trip-editor';

/** Approved source title preview and metadata Undo controls; planning text stays a plain subtitle. */
export function SettingsHeader({
  editor,
  contextual = false,
}: {
  editor: ReturnType<typeof useTripEditor>;
  contextual?: boolean;
}) {
  const { t } = useTranslation('trips');
  return (
    <>
      <header className="flex items-center justify-between">
        {!contextual && (
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/trips">
              <ArrowLeft className="size-4" aria-hidden />
              {t('title')}
            </Link>
          </Button>
        )}
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={!editor.canUndo}
          onClick={() => {
            void editor.undo();
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('undo')}
        </Button>
      </header>
      {!contextual && <PageHeader title={t('settings')} />}
      <div>
        <p className="font-medium">{tripTitle(editor.draft, t('trip'))}</p>
        {editor.draft.when && (
          <p
            aria-label={t('subtitle')}
            className="whitespace-pre-wrap text-sm text-muted-foreground"
          >
            {editor.draft.when}
          </p>
        )}
      </div>
      <p role="status" className="text-muted-foreground">
        {t(saveStatus(editor))}
      </p>
    </>
  );
}
function saveStatus(editor: ReturnType<typeof useTripEditor>): string {
  if (editor.busy) return 'saving';
  if (editor.failure) return 'saveFailed';
  return editor.dirty ? 'unsaved' : 'saved';
}
