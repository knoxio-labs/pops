#!/usr/bin/env node
/**
 * ADR-054 error-code registry guard.
 *
 * REST errors are a protocol, not an implementation detail. This guard keeps
 * the protocol inventory closed: every code thrown at a pillar boundary is
 * registered, registered codes are not removed from the base branch, and the
 * wire code is a stable lower-case dotted identifier rather than an exception
 * class name.
 *
 * The scan is deliberately source-based. CI runs it before any compiled graph
 * exists, so the guard reads the same `defineErrors` declarations and literal
 * envelope codes that reviewers read. Dynamic code construction is reported
 * when it derives from an error name; a caller must choose a registered code
 * instead.
 *
 * Usage:
 *   node scripts/ci/check-error-codes.mjs
 *   node scripts/ci/check-error-codes.mjs --self-test
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** ADR-054's machine-readable code format. */
export const ERROR_CODE_PATTERN = /^[a-z]+(\.[a-z_]+){2}$/u;

const CLIENT_CODE_PREFIXES = ['ios.', 'web.'];

/** @typedef {{ path: string, text: string }} SourceFile */
/** @typedef {{ code: string, path: string, line: number, reason: string }} RegisteredCode */
/** @typedef {{ rule: string, path: string, line: number, message: string, code?: string }} Finding */

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.build',
  'DerivedData',
]);

/**
 * Replace comments and string literals with spaces while preserving newlines
 * and offsets. The scanner only needs structural punctuation and identifiers;
 * retaining offsets makes every finding point at the original source.
 *
 * @param {string} source
 * @returns {string}
 */
export function maskNonCode(source) {
  const output = source.split('');
  let state = 'code';
  let quote = '';

  const blank = (index) => {
    if (output[index] !== '\n' && output[index] !== '\r') output[index] = ' ';
  };

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (current === undefined) break;

    if (state === 'code') {
      if (current === '/' && next === '/') {
        blank(index);
        blank(index + 1);
        index += 1;
        state = 'line-comment';
      } else if (current === '/' && next === '*') {
        blank(index);
        blank(index + 1);
        index += 1;
        state = 'block-comment';
      } else if (current === "'" || current === '"' || current === '`') {
        quote = current;
        blank(index);
        state = 'string';
      }
      continue;
    }

    if (state === 'line-comment') {
      if (current === '\n' || current === '\r') state = 'code';
      else blank(index);
      continue;
    }

    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        blank(index);
        blank(index + 1);
        index += 1;
        state = 'code';
      } else {
        blank(index);
      }
      continue;
    }

    if (current === '\\') {
      blank(index);
      if (index + 1 < source.length) {
        blank(index + 1);
        index += 1;
      }
    } else if (current === quote) {
      blank(index);
      state = 'code';
    } else {
      blank(index);
    }
  }

  return output.join('');
}

/**
 * Return the matching closing delimiter in a source mask.
 *
 * @param {string} masked
 * @param {number} start
 * @param {string} open
 * @param {string} close
 * @returns {number}
 */
function matchingDelimiter(masked, start, open, close) {
  let depth = 0;
  for (let index = start; index < masked.length; index += 1) {
    const character = masked[index];
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** @param {string} text @param {number} offset @returns {number} */
function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

/**
 * Walk one directory without following generated/dependency trees.
 *
 * @param {string} directory
 * @param {string[]} result
 * @returns {void}
 */
function walk(directory, result) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name), result);
    } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/u.test(entry.name)) {
      result.push(join(directory, entry.name));
    }
  }
}

/**
 * Discover production source under every pillar. Tests are excluded because
 * test fixtures intentionally contain protocol examples that are not runtime
 * throw sites.
 *
 * @param {string} root
 * @returns {SourceFile[]}
 */
export function discoverSources(root) {
  const files = [];
  const pillarsDirectory = join(root, 'pillars');
  if (!existsSync(pillarsDirectory)) return [];

  for (const entry of readdirSync(pillarsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourcePaths = [];
    walk(join(pillarsDirectory, entry.name, 'src'), sourcePaths);
    for (const absolutePath of sourcePaths) {
      if (/__tests__|(?:^|[.])(test|spec)\.[^.]+$/u.test(absolutePath)) continue;
      const relativePath = absolutePath.slice(root.length + 1);
      files.push({ path: relativePath, text: readFileSync(absolutePath, 'utf8') });
    }
  }
  return files.toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * Read top-level object properties from a definition object. Each value must
 * be an object containing a literal `area`; malformed entries become findings
 * rather than disappearing from the registry.
 *
 * @param {string} source
 * @param {number} objectStart
 * @param {string} filePath
 * @returns {{ entries: RegisteredCode[], malformed: Finding[] }}
 */
function readDefinitions(source, objectStart, filePath) {
  const masked = maskNonCode(source);
  const objectEnd = matchingDelimiter(masked, objectStart, '{', '}');
  if (objectEnd < 0) {
    return {
      entries: [],
      malformed: [
        {
          rule: 'malformed-registration',
          path: filePath,
          line: lineAt(source, objectStart),
          message: 'defineErrors table has no closing brace',
        },
      ],
    };
  }

  /** @type {RegisteredCode[]} */
  const entries = [];
  /** @type {Finding[]} */
  const malformed = [];
  let cursor = objectStart + 1;

  while (cursor < objectEnd) {
    while (cursor < objectEnd && /[\s,]/u.test(masked[cursor] ?? '')) cursor += 1;
    if (cursor >= objectEnd) break;

    const keyMatch = source
      .slice(cursor, objectEnd)
      .match(/^(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])/u);
    if (keyMatch === null) {
      malformed.push({
        rule: 'malformed-registration',
        path: filePath,
        line: lineAt(source, cursor),
        message: 'defineErrors table contains a property that is not a static reason',
      });
      break;
    }
    const reason = keyMatch[1] ?? keyMatch[2];
    if (reason === undefined) break;
    cursor += keyMatch[0].length;
    while (cursor < objectEnd && /\s/u.test(masked[cursor] ?? '')) cursor += 1;
    if (masked[cursor] !== ':') {
      malformed.push({
        rule: 'malformed-registration',
        path: filePath,
        line: lineAt(source, cursor),
        message: `registration for ${reason} has no value`,
      });
      break;
    }
    cursor += 1;
    while (cursor < objectEnd && /\s/u.test(masked[cursor] ?? '')) cursor += 1;
    if (masked[cursor] !== '{') {
      malformed.push({
        rule: 'malformed-registration',
        path: filePath,
        line: lineAt(source, cursor),
        message: `registration for ${reason} must be an object`,
      });
      while (cursor < objectEnd && masked[cursor] !== ',') cursor += 1;
      continue;
    }

    const valueEnd = matchingDelimiter(masked, cursor, '{', '}');
    if (valueEnd < 0 || valueEnd > objectEnd) {
      malformed.push({
        rule: 'malformed-registration',
        path: filePath,
        line: lineAt(source, cursor),
        message: `registration for ${reason} has no closing brace`,
      });
      break;
    }
    const value = source.slice(cursor, valueEnd + 1);
    const areaMatch = value.match(/\barea\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/u);
    if (areaMatch?.[1] === undefined) {
      malformed.push({
        rule: 'malformed-registration',
        path: filePath,
        line: lineAt(source, cursor),
        message: `registration for ${reason} has no literal area`,
      });
    } else {
      entries.push({
        code: '',
        path: filePath,
        line: lineAt(source, cursor),
        reason: `${areaMatch[1]}.${reason}`,
      });
    }
    cursor = valueEnd + 1;
  }

  return { entries, malformed };
}

/**
 * Find all `defineErrors('pillar', table)` calls and expand their tables.
 *
 * @param {SourceFile[]} sources
 * @returns {{ registered: RegisteredCode[], malformed: Finding[], helpers: Map<string, Map<string, string>> }}
 */
export function collectRegisteredCodes(sources) {
  /** @type {RegisteredCode[]} */
  const registered = [];
  /** @type {Finding[]} */
  const malformed = [];
  /** @type {Map<string, Map<string, string>>} */
  const helpers = new Map();

  for (const sourceFile of sources) {
    const masked = maskNonCode(sourceFile.text);
    const callPattern = /\bdefineErrors\s*\(\s*['"]([a-z][a-z0-9_-]*)['"]\s*,/gu;
    for (const match of sourceFile.text.matchAll(callPattern)) {
      const pillar = match[1];
      const callStart = match.index ?? 0;
      if (pillar === undefined) continue;
      const quoteOffset = Math.min(
        ...["'", '"'].map((quote) => {
          const offset = match[0].indexOf(quote);
          return offset < 0 ? match[0].length : offset;
        })
      );
      const visiblePrefix = match[0].slice(0, quoteOffset);
      if (masked.slice(callStart, callStart + visiblePrefix.length) !== visiblePrefix) continue;
      let objectStart = callStart + match[0].length;
      while (/\s/u.test(masked[objectStart] ?? '')) objectStart += 1;

      if (masked[objectStart] !== '{') {
        const tableNameMatch = masked.slice(objectStart).match(/^([A-Za-z_$][\w$]*)/u);
        const tableName = tableNameMatch?.[1];
        if (tableName === undefined) {
          malformed.push({
            rule: 'malformed-registration',
            path: sourceFile.path,
            line: lineAt(sourceFile.text, objectStart),
            message: `defineErrors(${pillar}) has no static table`,
          });
          continue;
        }
        const declaration = new RegExp(`(?:const|let|var)\\s+${tableName}\\s*=\\s*\\{`, 'u').exec(
          masked
        );
        if (declaration === null || declaration.index === undefined) {
          malformed.push({
            rule: 'malformed-registration',
            path: sourceFile.path,
            line: lineAt(sourceFile.text, objectStart),
            message: `defineErrors(${pillar}) references table ${tableName}, which is not declared locally`,
          });
          continue;
        }
        objectStart = declaration.index + declaration[0].lastIndexOf('{');
      }

      const result = readDefinitions(sourceFile.text, objectStart, sourceFile.path);
      malformed.push(...result.malformed);
      const helperMatch = masked
        .slice(0, callStart)
        .match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/u);
      const helperName = helperMatch?.[1];
      const helperCodes = new Map();
      for (const entry of result.entries) {
        entry.code = `${pillar}.${entry.reason}`;
        registered.push(entry);
        const reason = entry.reason.slice(entry.reason.lastIndexOf('.') + 1);
        helperCodes.set(reason, entry.code);
      }
      if (helperName !== undefined) helpers.set(`${sourceFile.path}:${helperName}`, helperCodes);
    }
  }

  return { registered, malformed, helpers };
}

/**
 * Collect literal dotted codes in envelope-shaped object properties and
 * helper throws. This catches a code introduced without going through the
 * registry table while ignoring non-ADR domain codes such as parser issue
 * labels.
 *
 * @param {SourceFile[]} sources
 * @param {ReturnType<typeof collectRegisteredCodes>} registry
 * @returns {{ literals: Array<{code: string, path: string, line: number}>, derivations: Finding[], helperThrows: Array<{code: string, path: string, line: number}> }}
 */
export function collectThrowSites(sources, registry) {
  const literals = [];
  const helperThrows = [];
  const derivations = [];

  for (const sourceFile of sources) {
    const masked = maskNonCode(sourceFile.text);
    const codePattern = /\bcode\s*:\s*['"]([^'"]+)['"]/gu;
    for (const match of sourceFile.text.matchAll(codePattern)) {
      const code = match[1];
      const offset = match.index ?? 0;
      const prefix = match[0].match(/^\s*code\s*:\s*/u)?.[0] ?? '';
      if (prefix.length === 0 || masked.slice(offset, offset + prefix.length) !== prefix) continue;
      if (code?.includes('.') === true) {
        literals.push({ code, path: sourceFile.path, line: lineAt(sourceFile.text, offset) });
      }
    }

    const derivationPattern = /\bcode\s*:\s*[A-Za-z_$][\w$]*\.(?:name|constructor\.name)\b/gu;
    for (const match of masked.matchAll(derivationPattern)) {
      const offset = match.index ?? 0;
      derivations.push({
        rule: 'class-name-derivation',
        path: sourceFile.path,
        line: lineAt(sourceFile.text, offset),
        message: 'error codes must not be derived from an exception class name',
      });
    }

    const helperNames = [...registry.helpers.entries()]
      .filter(([key]) => key.startsWith(`${sourceFile.path}:`))
      .flatMap(([key, reasons]) => {
        const name = key.slice(sourceFile.path.length + 1);
        return [...reasons.entries()].map(([reason, code]) => ({ name, reason, code }));
      });
    for (const { name, reason, code } of helperNames) {
      const throwPattern = new RegExp(`\\bthrow\\s+${name}\\.${reason}\\s*\\(`, 'gu');
      for (const match of masked.matchAll(throwPattern)) {
        const offset = match.index ?? 0;
        helperThrows.push({ code, path: sourceFile.path, line: lineAt(sourceFile.text, offset) });
      }
    }
  }

  return { literals, derivations, helperThrows };
}

/**
 * Analyze a source tree against a registry from the base branch.
 *
 * @param {SourceFile[]} sources
 * @param {SourceFile[]} [baselineSources]
 * @returns {{ findings: Finding[], registered: RegisteredCode[], observed: Array<{code: string, path: string, line: number}> }}
 */
export function analyzeSources(sources, baselineSources = []) {
  const registry = collectRegisteredCodes(sources);
  const baseline = collectRegisteredCodes(baselineSources);
  const sites = collectThrowSites(sources, registry);
  const findings = [...registry.malformed, ...sites.derivations];
  const registeredCodes = new Set(registry.registered.map((entry) => entry.code));
  const baselineCodes = new Set(baseline.registered.map((entry) => entry.code));
  const observed = [...sites.literals, ...sites.helperThrows];

  for (const entry of registry.registered) {
    if (!ERROR_CODE_PATTERN.test(entry.code)) {
      findings.push({
        rule: 'invalid-format',
        path: entry.path,
        line: entry.line,
        code: entry.code,
        message: `registered code ${entry.code} does not match ${ERROR_CODE_PATTERN}`,
      });
    }
  }

  for (const site of sites.literals) {
    if (!ERROR_CODE_PATTERN.test(site.code)) {
      findings.push({
        rule: 'invalid-format',
        path: site.path,
        line: site.line,
        code: site.code,
        message: `thrown code ${site.code} does not match ${ERROR_CODE_PATTERN}`,
      });
    }
    const isClientCode = CLIENT_CODE_PREFIXES.some((prefix) => site.code.startsWith(prefix));
    if (!registeredCodes.has(site.code) && !isClientCode) {
      findings.push({
        rule: 'unregistered',
        path: site.path,
        line: site.line,
        code: site.code,
        message: `code ${site.code} is used but is not registered with defineErrors`,
      });
    }
  }

  for (const site of sites.helperThrows) {
    if (!registeredCodes.has(site.code)) {
      findings.push({
        rule: 'unregistered',
        path: site.path,
        line: site.line,
        code: site.code,
        message: `throw site resolves to ${site.code}, which is not registered`,
      });
    }
  }

  for (const code of baselineCodes) {
    if (!registeredCodes.has(code)) {
      const baselineEntry = baseline.registered.find((entry) => entry.code === code);
      if (baselineEntry !== undefined) {
        findings.push({
          rule: 'removed',
          path: baselineEntry.path,
          line: baselineEntry.line,
          code,
          message: `code ${code} is registered on origin/main but absent now`,
        });
      }
    }
  }

  return { findings, registered: registry.registered, observed };
}

/**
 * Read the base branch's pillar sources without checking out or mutating it.
 *
 * @param {string} root
 * @param {string} ref
 * @returns {SourceFile[]}
 */
export function readGitSources(root, ref) {
  let names;
  try {
    names = execFileSync('git', ['grep', '-l', 'defineErrors', ref, '--', 'pillars'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .filter((name) => !/__tests__|(?:^|[.])(test|spec)\.[^.]+$/u.test(name));
  } catch (error) {
    if (error?.status === 1) return [];
    throw new Error(`could not read ${ref} pillar sources: ${String(error)}`, { cause: error });
  }

  return names.map((name) => {
    let text;
    try {
      text = execFileSync('git', ['show', `${ref}:${name}`], { cwd: root, encoding: 'utf8' });
    } catch (error) {
      throw new Error(`could not read ${ref}:${name}: ${String(error)}`, { cause: error });
    }
    return { path: name, text };
  });
}

/** @param {Finding[]} findings @returns {string} */
export function formatFindings(findings) {
  return findings
    .toSorted((a, b) =>
      `${a.path}:${a.line}:${a.rule}`.localeCompare(`${b.path}:${b.line}:${b.rule}`)
    )
    .map((finding) => {
      const code = finding.code === undefined ? '' : ` [${finding.code}]`;
      return `${finding.rule}: ${finding.path}:${finding.line}${code} — ${finding.message}`;
    })
    .join('\n');
}

/**
 * Run the four required fixture controls. The function is exported so the
 * Vitest suite and the CLI exercise the same assertions.
 *
 * @returns {boolean}
 */
export function runSelfTest() {
  const good = [
    {
      path: 'pillars/demo/src/api/errors.ts',
      text: `import { defineErrors, PopsError } from '@pops/pillar-express';\nconst demoErrors = defineErrors('demo', { ok: { area: 'request', status: 400, message: 'No.', retryable: false } });\nexport function fail() { throw demoErrors.ok(); }\nexport function explicit() { throw new PopsError({ code: 'demo.request.ok', status: 400, message: 'No.', retryable: false }); }`,
    },
  ];
  if (analyzeSources(good).findings.length > 0) {
    console.error('SELF-TEST FAILED (passing tree):');
    console.error(formatFindings(analyzeSources(good).findings));
    return false;
  }

  const cases = [
    {
      name: 'unregistered',
      sources: [
        good[0],
        {
          path: 'pillars/demo/src/api/unregistered.ts',
          text: "throw new PopsError({ code: 'demo.request.missing', status: 400, message: 'No.', retryable: false });",
        },
      ],
      rule: 'unregistered',
    },
    {
      name: 'removed',
      sources: [good[0]],
      baseline: [
        {
          path: 'pillars/demo/src/api/errors.ts',
          text: "const demoErrors = defineErrors('demo', { removed: { area: 'request', status: 400, message: 'No.', retryable: false } });",
        },
      ],
      rule: 'removed',
    },
    {
      name: 'invalid format',
      sources: [
        {
          path: 'pillars/demo/src/api/errors.ts',
          text: "const demoErrors = defineErrors('demo', { bad: { area: 'Bad-Area', status: 400, message: 'No.', retryable: false } });",
        },
      ],
      rule: 'invalid-format',
    },
    {
      name: 'class-name derivation',
      sources: [
        {
          path: 'pillars/demo/src/api/errors.ts',
          text: 'function map(error) { return { code: error.name, message: error.message }; }',
        },
      ],
      rule: 'class-name-derivation',
    },
  ];

  for (const testCase of cases) {
    const result = analyzeSources(testCase.sources, testCase.baseline ?? []);
    if (!result.findings.some((finding) => finding.rule === testCase.rule)) {
      console.error(`SELF-TEST FAILED (${testCase.name}): the fixture was not reported`);
      return false;
    }
  }
  console.log('self-test OK — passing tree and all four error-code violations are reported.');
  return true;
}

/** @returns {number} */
function main() {
  if (process.argv.includes('--self-test')) return runSelfTest() ? 0 : 1;

  let analysis;
  try {
    const sources = discoverSources(repoRoot);
    if (sources.length === 0) {
      console.error('error-code guard found no pillar source files');
      return 1;
    }
    const baseline = readGitSources(repoRoot, 'origin/main');
    analysis = analyzeSources(sources, baseline);
  } catch (error) {
    console.error(String(error));
    return 1;
  }

  if (analysis.findings.length > 0) {
    console.error('ADR-054 error-code guard failed:');
    console.error(formatFindings(analysis.findings));
    return 1;
  }
  console.log(
    `ADR-054 error-code guard OK — ${analysis.registered.length} registered code(s), ${analysis.observed.length} observed throw site(s).`
  );
  return 0;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main();
}
