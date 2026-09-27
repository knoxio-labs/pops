import { cn } from '@pops/ui';

import { EmptyLine } from '../../foundation/item-page/section-parts';
import { INVENTORY_ICONS } from '../../foundation/model/icons';
import { FactRow } from './fact-row';
import { StoredFieldEditor } from './stored-field-editor';

import type { ReactElement } from 'react';

import type { DetailFact } from './detail-model';
import type { FactEditing } from './use-fact-editing';

/** Props for the read-only facts block. */
export interface FactsSectionProps {
  facts: readonly DetailFact[];
  typeName: string | null;
  layout?: 'grid' | 'list';
  readOnly?: boolean;
  onSetType?: () => void;
  onQuantity?: (action: 'split' | 'change') => void;
  editing?: FactEditing;
}

function NoFacts({
  typeName,
  readOnly,
  onSetType,
}: Pick<FactsSectionProps, 'typeName' | 'readOnly' | 'onSetType'>): ReactElement {
  if (typeName === null) {
    return (
      <EmptyLine
        icon={INVENTORY_ICONS.type}
        text="Untyped, so it has no fields yet."
        actionLabel={readOnly ? undefined : 'Set type'}
        onAction={readOnly ? undefined : onSetType}
      />
    );
  }
  return (
    <EmptyLine icon={INVENTORY_ICONS.type} text={`${typeName} has no fields beyond the name.`} />
  );
}

function factEditor(
  fact: DetailFact,
  readOnly: boolean,
  editing: FactEditing | undefined,
  phase: ReturnType<FactEditing['phaseOf']>
): ReactElement | undefined {
  if (editing === undefined || readOnly || !fact.inline) return undefined;
  if (phase !== 'editing' && phase !== 'saving') return undefined;
  const field = editing.fieldOf(fact.key);
  if (field === null) return undefined;
  return (
    <StoredFieldEditor
      field={field}
      drafts={editing.drafts}
      error={editing.problem ?? undefined}
      world={editing.world}
      typeLabel={editing.typeLabel}
      onText={(values) =>
        editing.change({
          ...editing.drafts,
          text: { ...editing.drafts.text, [field.id]: values },
        })
      }
      onRefs={(refs) =>
        editing.change({
          ...editing.drafts,
          refs: { ...editing.drafts.refs, [field.id]: refs },
        })
      }
      onBoolean={(value) =>
        editing.change({
          ...editing.drafts,
          booleans: { ...editing.drafts.booleans, [field.id]: value },
        })
      }
    />
  );
}

function editHandler(
  editing: FactEditing | undefined,
  readOnly: boolean,
  fact: DetailFact,
  phase: ReturnType<FactEditing['phaseOf']>
): ((key: string) => void) | undefined {
  if (editing === undefined || readOnly || !fact.inline || phase === 'saving') return undefined;
  if (phase === 'editing') return () => editing.save();
  return editing.start;
}

function FactRowForFact({
  fact,
  readOnly,
  inlineLabel,
  onQuantity,
  editing,
}: {
  fact: DetailFact;
  readOnly: boolean;
  inlineLabel: boolean;
  onQuantity: FactsSectionProps['onQuantity'];
  editing: FactEditing | undefined;
}): ReactElement {
  const phase = editing?.phaseOf(fact.key) ?? 'idle';
  const onEdit = editHandler(editing, readOnly, fact, phase);
  return (
    <FactRow
      fact={fact}
      readOnly={readOnly}
      inlineLabel={inlineLabel}
      onQuantity={onQuantity}
      phase={phase}
      rejection={editing?.rejection?.key === fact.key ? editing.rejection.reason : undefined}
      onEdit={onEdit}
      onRevert={editing?.revert}
      editor={factEditor(fact, readOnly, editing, phase)}
    />
  );
}

/** Renders the facts rail in list or wider grid form. */
export function FactsSection({
  facts,
  typeName,
  layout = 'grid',
  readOnly = false,
  onSetType,
  onQuantity,
  editing,
}: FactsSectionProps): ReactElement {
  if (facts.length === 0)
    return <NoFacts typeName={typeName} readOnly={readOnly} onSetType={onSetType} />;
  return (
    <div
      role="group"
      aria-label="Facts"
      className={cn(
        'grid min-w-0 content-start gap-x-2 gap-y-0.5',
        layout === 'grid' ? 'grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3' : 'grid-cols-1'
      )}
    >
      {facts.map((fact) => (
        <FactRowForFact
          key={fact.key}
          fact={fact}
          readOnly={readOnly}
          inlineLabel={layout === 'list'}
          onQuantity={onQuantity}
          editing={editing}
        />
      ))}
    </div>
  );
}
