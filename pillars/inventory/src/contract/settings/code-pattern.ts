/** The settings key that enables or disables inventory code suggestions. */
export const SUGGEST_CODES_KEY = 'inventory.suggestCodes';

/** The settings key that controls generated inventory code patterns. */
export const CODE_PATTERN_KEY = 'inventory.codePattern';

/** The default inventory code pattern. */
export const DEFAULT_CODE_PATTERN = '{type}{##}';

/** The manifest validation expression for inventory code patterns. */
export const CODE_PATTERN_RULE =
  '^(?:[A-Za-z0-9-]|\\{type\\})*\\{#{1,6}\\}(?:[A-Za-z0-9-]|\\{type\\})*$';
