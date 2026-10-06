import { Film, Package, PiggyBank, Sparkles } from 'lucide-react';

import { Button } from '@pops/ui';

const STARTER_PROMPTS = [
  {
    title: 'Explore my inventory',
    description: 'Find an item or check where it is.',
    prompt: 'Help me find an item in my inventory.',
    icon: Package,
  },
  {
    title: 'Review my spending',
    description: 'Get a summary of recent transactions.',
    prompt: 'Summarize my recent spending.',
    icon: PiggyBank,
  },
  {
    title: 'Find something to watch',
    description: 'Explore my watchlist and media library.',
    prompt: 'Suggest something to watch from my library.',
    icon: Film,
  },
  {
    title: 'Ask about my data',
    description: 'See what Ego can help you look up.',
    prompt: 'What can you help me with using my data?',
    icon: Sparkles,
  },
] as const;

interface ChatWelcomeProps {
  onPrompt: (prompt: string) => void;
}

/** First-turn welcome and prompt starters for the capabilities Ego exposes today. */
export function ChatWelcome({ onPrompt }: ChatWelcomeProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-app-accent/10 text-app-accent">
            <Sparkles className="size-6" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              What can I help you with?
            </h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              Ask about your inventory, finances or media library, or start with one of these.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" aria-label="Suggested prompts">
          {STARTER_PROMPTS.map(({ title, description, prompt, icon: Icon }) => (
            <Button
              key={title}
              type="button"
              variant="outline"
              onClick={() => onPrompt(prompt)}
              className="h-auto min-h-24 justify-start gap-3 rounded-xl px-4 py-4 text-left whitespace-normal hover:border-app-accent/50 hover:bg-app-accent/5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-app-accent/10 text-app-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
