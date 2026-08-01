import { Input, Label, Select } from '@pops/ui';

import { EntityField, type EntityOutcome } from './EntityField';
import { MATCH_TYPE_OPTIONS, parseTxnType, TYPE_OPTIONS } from './TypeOptions';

import type { AddRuleData, EditRuleData } from '../types';

interface OutcomeFieldsProps<T extends EditRuleData> {
  data: T;
  onChange: (next: T) => void;
  disabled: boolean;
  /**
   * The target rule's current entity, for `edit` ops: their `data` is a patch,
   * so an untouched `entityId`/`entityName` is `undefined` and the effective
   * value is whatever the rule already carries.
   */
  entityBaseline?: EntityOutcome;
}

function effectiveEntity(data: EditRuleData, baseline?: EntityOutcome): EntityOutcome {
  return {
    entityId: data.entityId === undefined ? (baseline?.entityId ?? null) : data.entityId,
    entityName: data.entityName === undefined ? (baseline?.entityName ?? null) : data.entityName,
  };
}

function OutcomeFields<T extends EditRuleData>({
  data,
  onChange,
  disabled,
  entityBaseline,
}: OutcomeFieldsProps<T>) {
  return (
    <>
      <EntityField
        value={effectiveEntity(data, entityBaseline)}
        onChange={(entity) => onChange({ ...data, ...entity })}
        disabled={disabled}
      />
      <div className="space-y-1">
        <Label>Transaction type</Label>
        <Select
          value={data.transactionType ?? ''}
          onChange={(e) => onChange({ ...data, transactionType: parseTxnType(e.target.value) })}
          options={TYPE_OPTIONS}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          value={data.location ?? ''}
          onChange={(e) => onChange({ ...data, location: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
    </>
  );
}

export function RuleDataEditor(props: {
  data: AddRuleData;
  onChange: (next: AddRuleData) => void;
  disabled: boolean;
}) {
  const { data, onChange, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Description pattern</Label>
        <Input
          value={data.descriptionPattern}
          onChange={(e) => onChange({ ...data, descriptionPattern: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Match type</Label>
        <Select
          value={data.matchType}
          onChange={(e) =>
            onChange({ ...data, matchType: e.target.value as 'exact' | 'contains' | 'regex' })
          }
          options={MATCH_TYPE_OPTIONS}
          disabled={disabled}
        />
      </div>
      <OutcomeFields data={data} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function EditDataEditor(props: {
  data: EditRuleData;
  onChange: (next: EditRuleData) => void;
  disabled: boolean;
  entityBaseline?: EntityOutcome;
}) {
  return (
    <div className="space-y-3">
      <OutcomeFields {...props} />
    </div>
  );
}
