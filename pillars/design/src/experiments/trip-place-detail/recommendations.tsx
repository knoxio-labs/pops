import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from '@pops/ui';

import { useIdea } from './context';

import type { IdeaState } from './model';

/** Read recommendations and explicitly edit their retained contact reference and original note. */
export function IdeaRecommendations() {
  const { state, change } = useIdea();
  return (
    <section aria-label="Recommendations" className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-app-accent" aria-hidden />
          Recommendations
        </h2>
        <Button
          variant="ghost"
          onClick={() =>
            change({
              ...state,
              recommendations: [
                ...state.recommendations,
                { id: crypto.randomUUID(), contactId: '', note: '' },
              ],
            })
          }
        >
          <Plus className="size-4" aria-hidden />
          Add recommendation
        </Button>
      </div>
      {state.recommendations.map((recommendation, index) => (
        <Recommendation key={recommendation.id} id={recommendation.id} index={index} />
      ))}
    </section>
  );
}

function Recommendation({ id, index }: { id: string; index: number }) {
  const { state } = useIdea();
  const recommendation = state.recommendations.find((item) => item.id === id);
  const [editing, setEditing] = useState(!recommendation?.contactId && !recommendation?.note);
  if (!recommendation) return null;
  const contact = state.contacts.find((item) => item.id === recommendation.contactId);
  return (
    <div className="flex items-start gap-2 border-l border-app-accent/40 pl-3">
      <div className="min-w-0 flex-1 space-y-1 py-2">
        {(contact || recommendation.contactId) && (
          <p className="text-sm font-medium">{contact?.name ?? 'Contact unavailable'}</p>
        )}
        {recommendation.note && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{recommendation.note}</p>
        )}
      </div>
      <Popover open={editing} onOpenChange={setEditing}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Edit recommendation ${index + 1}`}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="space-y-3">
          <h3 className="text-sm font-semibold">Edit recommendation {index + 1}</h3>
          <RecommendationFields id={id} index={index} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RecommendationFields({ id, index }: { id: string; index: number }) {
  const { state, change } = useIdea();
  const recommendation = state.recommendations.find((item) => item.id === id);
  if (!recommendation) return null;
  const update = (next: typeof recommendation) =>
    change({
      ...state,
      recommendations: state.recommendations.map((item) => (item.id === id ? next : item)),
    });
  return (
    <>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Recommended by</p>
        <ComboboxSelect
          aria-label={`Recommended by · ${index + 1}`}
          value={recommendation.contactId}
          options={contactOptions(state, recommendation.contactId)}
          placeholder="Choose contact"
          searchPlaceholder="Find a contact…"
          onChange={(value) => {
            if (typeof value === 'string' && value !== recommendation.contactId)
              update({ ...recommendation, contactId: value });
          }}
        />
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>Recommendation note</span>
        <Textarea
          aria-label={`Recommendation note · ${index + 1}`}
          key={recommendation.note}
          defaultValue={recommendation.note}
          placeholder="Add recommendation"
          onBlur={(event) => {
            if (event.currentTarget.value !== recommendation.note)
              update({ ...recommendation, note: event.currentTarget.value });
          }}
        />
      </label>
      <Button
        variant="ghost"
        className="text-destructive"
        onClick={() =>
          change({
            ...state,
            recommendations: state.recommendations.filter((item) => item.id !== id),
          })
        }
      >
        <Trash2 className="size-4" aria-hidden />
        Remove recommendation {index + 1}
      </Button>
    </>
  );
}

function contactOptions(state: IdeaState, selectedId: string) {
  const unavailable = selectedId && !state.contacts.some((contact) => contact.id === selectedId);
  return [
    { value: '', label: 'Without contact' },
    ...(unavailable ? [{ value: selectedId, label: 'Contact unavailable' }] : []),
    ...state.contacts.map((contact) => ({ value: contact.id, label: contact.name })),
  ];
}
