import { ExternalLink } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import { eventLink, useEventDetails } from './model';

/** A source or ticket link keeps invalid text editable while permitting only HTTP(S) navigation. */
export function EventLinkField({
  field,
  label,
  placeholder,
  openLabel,
}: {
  field: 'sourceUrl' | 'ticketUrl';
  label: string;
  placeholder: string;
  openLabel: string;
}) {
  const { data, change } = useEventDetails();
  const value = data.metadata[field];
  const link = eventLink(value);
  return (
    <div className="flex items-start gap-2">
      <TextInput
        aria-label={label}
        placeholder={placeholder}
        variant="ghost"
        key={value}
        defaultValue={value ?? ''}
        containerClassName="bg-transparent px-0"
        onBlur={(e) => {
          if (e.currentTarget.value !== value)
            change({
              ...data,
              metadata: { ...data.metadata, [field]: e.currentTarget.value || undefined },
            });
        }}
        error={value && !link ? 'Use an HTTP or HTTPS URL' : undefined}
      />
      {link && (
        <Button asChild variant="ghost" size="icon">
          <a href={link} target="_blank" rel="noreferrer" aria-label={openLabel}>
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}
