import { Input, Label, Select } from '@pops/ui';

import { EntityField, type EntityOutcome } from './EntityField';
import { MATCH_TYPE_OPTIONS, parseTxnType, TYPE_OPTIONS } from './TypeOptions';

import type { AddRuleData, EditRuleData } from '../types';

/** What a rule matches on — the pattern and how it is compared. */
export interface PatternOutcome {
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
}

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

function PatternFields({
  value,
  onChange,
  disabled,
}: {
  value: PatternOutcome;
  onChange: (next: PatternOutcome) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Description pattern</Label>
        <Input
          aria-label="Description pattern"
          value={value.descriptionPattern}
          onChange={(e) => onChange({ ...value, descriptionPattern: e.target.value })}
          disabled={disabled}
        />
        {value.descriptionPattern.trim() === '' && (
          <p className="text-xs text-warning">
            A rule needs a description pattern — changes cannot be saved while this is empty.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label>Match type</Label>
        <Select
          aria-label="Match type"
          value={value.matchType}
          onChange={(e) =>
            onChange({ ...value, matchType: e.target.value as PatternOutcome['matchType'] })
          }
          options={MATCH_TYPE_OPTIONS}
          disabled={disabled}
        />
      </div>
    </>
  );
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
          aria-label="Transaction type"
          value={data.transactionType ?? ''}
          onChange={(e) => onChange({ ...data, transactionType: parseTxnType(e.target.value) })}
          options={TYPE_OPTIONS}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label>Location</Label>
        <Input
          aria-label="Location"
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
      <PatternFields
        value={{ descriptionPattern: data.descriptionPattern, matchType: data.matchType }}
        onChange={(pattern) => onChange({ ...data, ...pattern })}
        disabled={disabled}
      />
      <OutcomeFields data={data} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/**
 * The baseline an `edit` op's patch is read against: the target rule's own
 * values, so a field the patch does not carry still renders what the rule does.
 */
export interface EditBaseline extends EntityOutcome, PatternOutcome {}

/**
 * Editor for an `edit` op. The pattern fields are only offered when the target
 * rule is known — without a baseline they would render empty and a stray
 * keystroke would rewrite a pattern the operator cannot see.
 */
export function EditDataEditor(props: {
  data: EditRuleData;
  onChange: (next: EditRuleData) => void;
  disabled: boolean;
  baseline?: EditBaseline;
}) {
  const { data, onChange, disabled, baseline } = props;
  return (
    <div className="space-y-3">
      {baseline && (
        <PatternFields
          value={{
            descriptionPattern: data.descriptionPattern ?? baseline.descriptionPattern,
            matchType: data.matchType ?? baseline.matchType,
          }}
          onChange={(pattern) => onChange({ ...data, ...pattern })}
          disabled={disabled}
        />
      )}
      <OutcomeFields
        data={data}
        onChange={onChange}
        disabled={disabled}
        entityBaseline={baseline}
      />
    </div>
  );
}
