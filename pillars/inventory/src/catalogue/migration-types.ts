import type { PrimitiveWireValue } from './value-types.js';

/** The closed set of deterministic value rewrites permitted at publication. */
export type CatalogueMigrationStep =
  | { readonly kind: 'copy'; readonly fromFieldId: string; readonly toFieldId: string }
  | {
      readonly kind: 'set_default';
      readonly fieldId: string;
      readonly values: readonly PrimitiveWireValue[];
    }
  | {
      readonly kind: 'map_enum';
      readonly fieldId: string;
      readonly optionIds: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'convert_decimal';
      readonly fromFieldId: string;
      readonly toFieldId: string;
      readonly factor: string;
    }
  | {
      readonly kind: 'replace_reference';
      readonly fieldId: string;
      readonly targetKind: 'item' | 'location';
      readonly fromTargetId: string;
      readonly toTargetId: string;
    }
  | { readonly kind: 'drop_value'; readonly fieldId: string };

/** One version-controlled migration between two catalogue snapshots. */
export interface CatalogueMigration {
  readonly name: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly affectedTypeIds: readonly string[];
  readonly affectedFieldIds: readonly string[];
  readonly steps: readonly CatalogueMigrationStep[];
}

/** The result of a successful all-or-nothing catalogue value migration. */
export interface CatalogueMigrationResult {
  readonly name: string;
  readonly affectedItems: number;
}
