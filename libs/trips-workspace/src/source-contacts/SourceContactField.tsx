import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import { referenceEntries } from '../reference-entries';
import { ContactReference } from './ContactReference';
import { sourceContactSession } from './session';
import { SourceContactChooser } from './SourceContactChooser';

import type { JSX } from 'react';

import type { SourceContactContext } from './session';

/** Host-owned labels for one explicit source reference role, without inferring domain meaning from a field name. */
export interface SourceContactFieldLabels {
  heading: string;
  empty: string;
  choose: string;
  recover: string;
  replace: (position: number) => string;
  remove: (position: number) => string;
}
interface SourceReference {
  uri: string;
  label?: string;
}
interface FieldProps {
  context: SourceContactContext;
  links: SourceReference[];
  disabled: boolean;
  save: (links: SourceReference[]) => void;
  labels: SourceContactFieldLabels;
}
/** Use owner-issued references for an explicitly selected source role; replacing one occurrence preserves all others. */
export function SourceContactField(props: FieldProps): JSX.Element {
  const { context, links, disabled, labels, save } = props;
  const session = sourceContactSession(useQueryClient(), context);
  const revision = JSON.stringify(links);
  return (
    <section aria-label={labels.heading} className="space-y-3">
      <h3 className="text-sm font-medium">{labels.heading}</h3>
      {links.length === 0 && <p className="text-sm text-muted-foreground">{labels.empty}</p>}
      {referenceEntries(links).map(({ link, index, key }) => (
        <div key={key} className="space-y-2 rounded-lg border border-border p-3">
          <ContactReference session={session} uri={link.uri} label={link.label} />
          <div className="flex flex-wrap items-start gap-3">
            <SourceContactChooser
              key={`${session.id}:${revision}:${index}`}
              session={session}
              links={links}
              disabled={disabled}
              intentKey={`replace:${revision}:${index}`}
              chooseLabel={labels.replace(index + 1)}
              recoverLabel={labels.recover}
              showRecovery={false}
              select={(uri) =>
                save(links.map((entry, position) => (position === index ? { uri } : entry)))
              }
            />
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={disabled}
              onClick={() => save(links.filter((_, position) => position !== index))}
              aria-label={labels.remove(index + 1)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <SourceContactChooser
        key={`${session.id}:add`}
        session={session}
        links={links}
        disabled={disabled}
        intentKey="add"
        chooseLabel={labels.choose}
        recoverLabel={labels.recover}
        showRecovery
        select={(uri) => save([...links, { uri }])}
      />
    </section>
  );
}
