import { Archive } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Input, Label, Switch, Textarea } from '@pops/ui';

import type { CatalogueType } from './types';

interface TypeFormDetailsProps {
  readonly containment: boolean;
  readonly description: string;
  readonly keyValue: string;
  readonly label: string;
  readonly onContainmentChange: (value: boolean) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onKeyChange: (value: string) => void;
  readonly onLabelChange: (value: string) => void;
  readonly type?: CatalogueType;
}

/** Renders catalogue type identity, description, and capability inputs. */
export function TypeFormDetails(props: TypeFormDetailsProps) {
  const { containment, description, keyValue, label, type } = props;
  return (
    <>
      <div>
        <h3 className="font-semibold">Type details</h3>
        <p className="text-sm text-muted-foreground">
          Give the type an owner-facing name and stable automation key.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TypeIdentity
          keyValue={keyValue}
          label={label}
          type={type}
          onKeyChange={props.onKeyChange}
          onLabelChange={props.onLabelChange}
        />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="catalogue-type-description">Description</Label>
          <Textarea
            id="catalogue-type-description"
            value={description}
            onChange={(event) => props.onDescriptionChange(event.target.value)}
          />
        </div>
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
          <div>
            <Label htmlFor="catalogue-containment" className="text-sm font-medium">
              Containment capability
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Items of this type can contain other items. Changing a published capability may
              require a migration.
            </p>
          </div>
          <Switch
            id="catalogue-containment"
            checked={containment}
            onCheckedChange={props.onContainmentChange}
          />
        </div>
      </div>
      {type?.archivedAt !== null && type?.archivedAt !== undefined && (
        <Alert>
          <Archive />
          <AlertTitle>This type is archived</AlertTitle>
          <AlertDescription>
            Existing items retain the definition, but new items cannot select it.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function TypeIdentity({
  keyValue,
  label,
  onKeyChange,
  onLabelChange,
  type,
}: Pick<TypeFormDetailsProps, 'keyValue' | 'label' | 'onKeyChange' | 'onLabelChange' | 'type'>) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="catalogue-type-label">Type label</Label>
        <Input
          id="catalogue-type-label"
          className="min-h-11"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalogue-type-key">Key</Label>
        <Input
          id="catalogue-type-key"
          className="min-h-11 font-mono"
          value={keyValue}
          disabled={type !== undefined}
          onChange={(event) => onKeyChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {type === undefined
            ? 'Generated from the label; editable until the first save.'
            : 'Published keys are immutable.'}
        </p>
      </div>
    </>
  );
}
