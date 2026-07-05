import PROMPTS from '@pops/finance/prompt-catalog';
/**
 * Read-only view of the AI prompt templates used across the finance pillar,
 * with model attribution.
 *
 * `PROMPTS` is `@pops/finance/prompt-catalog` — generated at build time by
 * calling the real `build*Prompt` functions with representative sample
 * inputs (`pillars/finance/src/api/modules/prompt-catalog.ts`), so this page
 * can never drift from what is actually sent to Claude (CF028, #2619). CI's
 * codegen-drift gate re-runs the generator and fails the build if a
 * `build*Prompt` edit isn't reflected here.
 */
import { PageHeader } from '@pops/ui';

export function PromptViewerPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Prompt Templates"
        description="Read-only view of the AI prompt templates used in this application. Prompts are defined in code and cannot be edited here."
      />

      <div className="space-y-8">
        {PROMPTS.map((prompt) => (
          <div key={prompt.id} className="border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b">
              <h2 className="font-semibold">{prompt.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{prompt.description}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-medium text-muted-foreground">Model:</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                  {prompt.model}
                </code>
              </div>
            </div>
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap bg-muted/10 overflow-x-auto">
              {prompt.template}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
