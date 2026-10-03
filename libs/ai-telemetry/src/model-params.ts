const SAMPLING_MODEL_PREFIXES = ['claude-haiku-4-5', 'claude-sonnet-4-6'] as const;

const NO_EFFORT_MODEL_PREFIXES = ['claude-haiku-4-5'] as const;

function hasPrefix(model: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => model.startsWith(prefix));
}

/**
 * Whether a model accepts `temperature` / `top_p` / `top_k`. Every model after
 * Haiku 4.5 and Sonnet 4.6 answers a non-default sampling param with a 400, so
 * an unrecognised id is treated as one that rejects them.
 */
export function supportsSamplingParams(model: string): boolean {
  return hasPrefix(model, SAMPLING_MODEL_PREFIXES);
}

/**
 * The sampling fragment of a Messages request: `{ temperature }` for a model
 * that accepts it, `{}` otherwise. Spread it into the request so one call site
 * stays valid across a model override.
 */
export function samplingParams(model: string, temperature: number): { temperature?: number } {
  return supportsSamplingParams(model) ? { temperature } : {};
}

/**
 * Whether a model accepts `output_config.effort`. Haiku 4.5 rejects it; an
 * unrecognised id is treated as a current model that accepts it.
 */
export function supportsEffort(model: string): boolean {
  return !hasPrefix(model, NO_EFFORT_MODEL_PREFIXES);
}

function isTextBlock(block: { type: string }): block is { type: 'text'; text: string } {
  return block.type === 'text' && 'text' in block && typeof block.text === 'string';
}

/**
 * The text of a Messages response: every `text` block joined in order, or `''`
 * when there is none. A thinking model's first block is a `thinking` block, so
 * reading `content[0]` returns nothing on exactly the models worth upgrading to.
 */
export function messageText(content: readonly { type: string }[]): string {
  return content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('');
}
