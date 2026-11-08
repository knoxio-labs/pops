import { ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

import { useIdea } from './context';
import { safeIdeaUrl } from './model';

/** Read source links, with explicit editing and navigation restricted to absolute HTTP(S) URLs. */
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
  const { state } = useIdea();
  const link = state.links.find((item) => item.id === id);
  const [editing, setEditing] = useState(!link?.label && !link?.url);
  if (!link) return null;
  const url = safeIdeaUrl(link.url);
  const label = link.label || link.url || 'Link';
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open link ${index + 1}`}
            className="flex min-h-11 items-center gap-2 text-sm font-medium text-foreground hover:underline"
          >
            <span className="truncate">{label}</span>
            <ExternalLink className="size-3 shrink-0 text-app-accent" aria-hidden />
          </a>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {url ? new URL(url).hostname : link.url}
        </p>
      </div>
      <Popover open={editing} onOpenChange={setEditing}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Edit link ${index + 1}`}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="space-y-3">
          <h3 className="text-sm font-semibold">Edit link {index + 1}</h3>
          <LinkFields id={id} index={index} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LinkFields({ id, index }: { id: string; index: number }) {
  const { state, change } = useIdea();
  const link = state.links.find((item) => item.id === id);
  if (!link) return null;
  return (
    <>
      {(['label', 'url'] as const).map((field) => (
        <label key={field} className="block space-y-1 text-xs text-muted-foreground">
          <span>{field === 'url' ? 'URL' : 'Link label'}</span>
          <TextInput
            key={link[field]}
            type={field === 'url' ? 'url' : 'text'}
            aria-label={`${field === 'url' ? 'URL' : 'Link label'} · ${index + 1}`}
            placeholder={field === 'url' ? 'https://…' : 'Label'}
            defaultValue={link[field]}
            error={
              field === 'url' && link.url && !safeIdeaUrl(link.url)
                ? 'Use an absolute HTTP or HTTPS URL'
                : undefined
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
        </label>
      ))}
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() => change({ ...state, links: state.links.filter((item) => item.id !== id) })}
      >
        <Trash2 className="size-4" aria-hidden />
        Remove link {index + 1}
      </Button>
    </>
  );
}
