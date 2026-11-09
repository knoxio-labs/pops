import { useMemo } from 'react';

import { ComboboxSelect, FileUpload } from '@pops/ui';

import { DocumentContext } from '../trip-document-linking/context';
import { DocumentSelector } from '../trip-document-linking/selector';
import { CaptureFileChips } from '../trip-quick-capture/file-chips';
import { useTripDocuments } from './context';
import { addTripDocumentFiles, setTripDocumentTarget } from './model';

/** Reuse the approved existing-original picker alongside actual pending browser files. */
export function DocumentCapture() {
  const { state, change } = useTripDocuments();
  const value = useMemo(
    () => ({
      state: state.linking,
      change: (linking: typeof state.linking) => change({ ...state, linking }),
    }),
    [state, change]
  );
  return (
    <DocumentContext value={value}>
      <section aria-label="Add documents" className="space-y-3">
        <ComboboxSelect
          aria-label="Link to"
          value={
            state.linking.targets.some((item) => item.id === state.linking.targetId)
              ? state.linking.targetId
              : ''
          }
          placeholder="Choose a trip or item"
          options={state.linking.targets.map((target) => ({
            value: target.id,
            label: target.label,
          }))}
          onChange={(id) => {
            if (typeof id === 'string') change(setTripDocumentTarget(state, id));
          }}
        />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <FileUpload
              multiple
              prompt="Upload a file"
              acceptHint={null}
              onFilesSelected={(files) => change(addTripDocumentFiles(state, files))}
            />
          </div>
          <DocumentSelector layout="picker" />
        </div>
        {state.linking.files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Selected files · not uploaded</p>
            <CaptureFileChips
              files={state.linking.files}
              onChange={(files) => change({ ...state, linking: { ...state.linking, files } })}
            />
          </div>
        )}
      </section>
    </DocumentContext>
  );
}
