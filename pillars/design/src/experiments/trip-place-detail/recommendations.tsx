import { Plus, Users, X } from 'lucide-react';

import { Button, ComboboxSelect, Textarea } from '@pops/ui';

import { useIdea } from './context';

/** Recommendations retain a reusable contact reference and the user's original note. */
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
  const { state, change } = useIdea();
  const recommendation = state.recommendations.find((item) => item.id === id);
  if (!recommendation) return null;
  const update = (next: typeof recommendation) =>
    change({
      ...state,
      recommendations: state.recommendations.map((item) => (item.id === id ? next : item)),
    });
  return (
    <div className="space-y-1 border-l border-app-accent/40 pl-3">
      <div className="flex items-center gap-2">
        <ComboboxSelect
          aria-label={`Recommended by · ${index + 1}`}
          value={
            state.contacts.some((contact) => contact.id === recommendation.contactId)
              ? recommendation.contactId
              : ''
          }
          options={[
            { value: '', label: 'Without contact' },
            ...state.contacts.map((contact) => ({ value: contact.id, label: contact.name })),
          ]}
          placeholder="Choose contact"
          searchPlaceholder="Find a contact…"
          variant="ghost"
          onChange={(value) => {
            if (typeof value === 'string' && value !== recommendation.contactId)
              update({ ...recommendation, contactId: value });
          }}
        />
        <Button
          variant="ghost"
          aria-label={`Remove recommendation ${index + 1}`}
          onClick={() =>
            change({
              ...state,
              recommendations: state.recommendations.filter((item) => item.id !== id),
            })
          }
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
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
    </div>
  );
}
