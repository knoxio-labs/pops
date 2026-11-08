import { FileText, Link2 } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Chip,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

import { useJourney } from './context';

/** Link original document identities; chip removal unlinks the journey and leaves the catalogue intact. */
export function JourneyDocuments() {
  const { state, change } = useJourney();
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Journey documents" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state.documentIds.map((id) => (
          <Chip
            key={id}
            variant="outline"
            className="min-h-11 max-w-full text-sm"
            prefix={<FileText className="size-4 text-app-accent" aria-hidden />}
            removable
            removeLabel={`Unlink ${state.documents.find((document) => document.id === id)?.name ?? 'unavailable document'}`}
            onRemove={() =>
              change({ ...state, documentIds: state.documentIds.filter((value) => value !== id) })
            }
          >
            {state.documents.find((document) => document.id === id)?.name ?? 'Document unavailable'}
          </Chip>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost">
              <Link2 className="size-4" aria-hidden />
              Link document
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-full p-0">
            <Command label="Find document">
              <CommandInput placeholder="Find a document…" />
              <CommandList>
                <CommandEmpty>No matching documents</CommandEmpty>
                <CommandGroup>
                  {state.documents
                    .filter((document) => !state.documentIds.includes(document.id))
                    .map((document) => (
                      <CommandItem
                        key={document.id}
                        value={document.name}
                        className="min-h-11"
                        onSelect={() => {
                          change({ ...state, documentIds: [...state.documentIds, document.id] });
                          setOpen(false);
                        }}
                      >
                        {document.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
