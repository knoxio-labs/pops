import { ExternalLink, Link2, Plus, X } from 'lucide-react';

import { Button, TextInput } from '@pops/ui';

import { useIdea } from './context';
import { safeIdeaUrl } from './model';

/** Source links are user-entered records, with explicit navigation only for HTTP(S) URLs. */
export function IdeaLinks() {
  const { state, change } = useIdea();
  return (
    <section aria-label="Idea links" className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-app-accent" aria-hidden />
          Links
        </h2>
        <Button
          variant="ghost"
          onClick={() =>
            change({
              ...state,
              links: [...state.links, { id: crypto.randomUUID(), label: '', url: '' }],
            })
          }
        >
          <Plus className="size-4" aria-hidden />
          Add link
        </Button>
      </div>
      {state.links.map((link, index) => (
        <LinkRow key={link.id} id={link.id} index={index} />
      ))}
    </section>
  );
}

function LinkRow({ id, index }: { id: string; index: number }) {
  const { state, change } = useIdea();
  const link = state.links.find((item) => item.id === id);
  if (!link) return null;
  const url = safeIdeaUrl(link.url);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        {(['label', 'url'] as const).map((field) => (
          <TextInput
            key={`${field}-${link[field]}`}
            type={field === 'url' ? 'url' : 'text'}
            aria-label={`${field === 'url' ? 'URL' : 'Link label'} · ${index + 1}`}
            placeholder={field === 'url' ? 'https://…' : 'Label'}
            variant="ghost"
            containerClassName="bg-transparent"
            defaultValue={link[field]}
            error={
              field === 'url' && link.url && !url ? 'Use an absolute HTTP or HTTPS URL' : undefined
            }
            onBlur={(event) => {
              if (event.currentTarget.value !== link[field])
                change({
                  ...state,
                  links: state.links.map((item) =>
                    item.id === id ? { ...item, [field]: event.currentTarget.value } : item
                  ),
                });
            }}
          />
        ))}
      </div>
      {url ? (
        <Button asChild variant="ghost" aria-label={`Open link ${index + 1}`}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </Button>
      ) : (
        <Button variant="ghost" disabled aria-label={`Open link ${index + 1}`}>
          <ExternalLink className="size-4" aria-hidden />
        </Button>
      )}
      <Button
        variant="ghost"
        aria-label={`Remove link ${index + 1}`}
        onClick={() => change({ ...state, links: state.links.filter((item) => item.id !== id) })}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
