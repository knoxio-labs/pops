import { SelectionPanel } from './selection-panel';

import type { SelectionPanelProps } from './selection-panel';
import type { LabelSubjects } from './useLabelSubjects';

/** Renders the label job selection rail beside the print preview. */
export function LabelsSelection({
  data,
  addControl,
  onOpenAdd,
  onAdd,
  onRemove,
  saveCode,
}: {
  data: LabelSubjects;
  addControl: SelectionPanelProps['addControl'];
  onOpenAdd: SelectionPanelProps['onOpenAdd'];
  onAdd: SelectionPanelProps['onAdd'];
  onRemove: SelectionPanelProps['onRemove'];
  saveCode: SelectionPanelProps['saveCode'];
}) {
  return (
    <aside className="flex min-w-0 flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start">
      <SelectionPanel
        subjects={data.subjects}
        contents={data.contents}
        missing={data.missing}
        saveCode={saveCode}
        addControl={addControl}
        onOpenAdd={onOpenAdd}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    </aside>
  );
}
