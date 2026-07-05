/**
 * Deterministic clean-up for an LLM-suggested merchant/entity name. Pure string
 * logic with no Anthropic dependency, so it is unit-testable without a network
 * call. Acts as a backstop for the categorizer prompt: even when the model
 * ignores the "strip suffixes / use natural casing" guidance, the output stays
 * clean. Case-insensitive lookups downstream still work because callers
 * lowercase before matching, so title-casing here never changes resolution.
 */

const PLACEHOLDER_LEADING_WORDS = [
  'unknown',
  'unidentified',
  'unspecified',
  'unnamed',
  'generic',
  'placeholder',
  'unrecognized',
  'unrecognised',
];

const PLACEHOLDER_REGEX = new RegExp(`^(${PLACEHOLDER_LEADING_WORDS.join('|')})\\b`, 'i');

const LEGAL_SUFFIX_TOKENS = new Set([
  'pty',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'llc',
  'plc',
  'gmbh',
  'co',
  'corp',
]);

/** Brands conventionally written in all caps — never title-cased by the backstop. */
const ALL_CAPS_BRANDS = new Set(['IKEA', 'KFC', 'BP', 'IGA', 'HSBC', 'H&M']);

const TITLE_CASE_PARTICLES = new Set(['of', 'and', 'the']);

function stripTrailingStoreCodes(name: string): string {
  return name.replace(/\s+\d{3,}\b.*$/, '').trim();
}

function stripLegalSuffixTokens(name: string): string {
  const tokens = name.split(/\s+/);
  let end = tokens.length;
  while (end > 0) {
    const token = tokens[end - 1]?.replaceAll(/[.,]/g, '').toLowerCase() ?? '';
    if (!LEGAL_SUFFIX_TOKENS.has(token)) break;
    end -= 1;
  }
  if (end === tokens.length) return name;
  return tokens
    .slice(0, end)
    .join(' ')
    .replaceAll(/^[\s.,]+|[\s.,]+$/g, '');
}

function capitalizeWord(word: string): string {
  return word.replaceAll(/[a-z]+/g, (run, offset: number) => {
    const preceding = offset > 0 ? word[offset - 1] : '';
    if (preceding === "'" && run.length === 1) return run;
    return run.charAt(0).toUpperCase() + run.slice(1);
  });
}

function toTitleCase(name: string): string {
  const words = name.split(/\s+/);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && TITLE_CASE_PARTICLES.has(lower)) return lower;
      return capitalizeWord(lower);
    })
    .join(' ');
}

/**
 * Normalize casing of an already-cleaned merchant name. Names that carry any
 * lowercase letter are assumed to already be in their true brand casing and are
 * returned untouched (so `eBay`, `iiNet` survive). An entirely-uppercase name
 * is title-cased unless it is a known all-caps brand (`IKEA`, `H&M`, …).
 */
function normalizeCasing(name: string): string {
  if (!/[A-Za-z]/.test(name)) return name;
  if (name !== name.toUpperCase()) return name;
  if (ALL_CAPS_BRANDS.has(name.toUpperCase())) return name;
  return toTitleCase(name);
}

/**
 * Sanitize an LLM-suggested entityName: drop placeholders to null, strip
 * leaked store numbers / location codes, drop trailing legal-entity suffixes
 * (`Pty Ltd`, `Inc`, …), and title-case verbatim ALL-CAPS names (except known
 * all-caps brands). Returns null when the cleaned result would not be a usable
 * merchant name.
 */
export function sanitizeEntityName(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (PLACEHOLDER_REGEX.test(trimmed)) return null;
  const withoutStoreCodes = stripTrailingStoreCodes(trimmed);
  if (withoutStoreCodes.length === 0) return null;
  if (PLACEHOLDER_REGEX.test(withoutStoreCodes)) return null;
  const withoutSuffixes = stripLegalSuffixTokens(withoutStoreCodes);
  const normalized = normalizeCasing(withoutSuffixes);
  return normalized.length > 0 ? normalized : null;
}
