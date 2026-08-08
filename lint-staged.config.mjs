/** Shell-escape a path for use inside a bash -c string. */
function esc(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const formatFiles = filenames.map(esc).join(' ');

    // 1. oxlint --fix  (auto-fix lint issues)
    // 2. oxfmt --write (auto-fix formatting and import sort)
    //
    // Both carry --no-error-on-unmatched-pattern: each tool resolves its own
    // ignore list (`.oxlintrc.json`, `.oxfmtrc.json` `ignorePatterns`) AFTER the
    // paths are handed to it, so a commit whose staged files are all ignored
    // leaves the tool with zero targets — which it treats as a usage error and
    // fails the whole hook.
    return [
      `oxlint --fix --no-error-on-unmatched-pattern ${formatFiles}`,
      `oxfmt --write --no-error-on-unmatched-pattern ${formatFiles}`,
    ];
  },

  '*.{json,md,css}': (filenames) => {
    // Never reformat an OpenAPI snapshot: a pillar's canonical
    // `**/openapi/<name>.openapi.json` is emitted by codegen, and every vendored
    // copy — `**/app/contracts/<name>.openapi.json` for a pillar app,
    // `clients/*/Contracts/<name>.openapi.json` for the Swift client — must stay
    // byte-identical to it (the check-vendored-contracts drift gate enforces
    // equality). Formatting either side would create silent drift at commit
    // time. The same paths are in `.oxfmtrc.json`'s `ignorePatterns`, so the
    // repo-wide `pnpm format` cannot undo this either.
    //
    // The other byte-identical pair in the repo — the device-signature fixture,
    // canonical under `clients/ios/Contracts/` and vendored into
    // `pillars/bfm/contracts/` — is deliberately NOT exempt, and the `.openapi`
    // infix above is what keeps the two rules apart. Both copies are plain
    // `*.json` at paths this rule covers, so both go through the same formatter
    // and land on the same bytes; excluding one and not the other is what would
    // break the gate. `pillars/bfm`'s own `oxfmt --check .` covers the vendored
    // copy too, so exempting it here would only move the failure.
    const isOpenApiSnapshot = (/** @type {string} */ f) =>
      /\/openapi\/[^/]+\.openapi\.json$/.test(f) ||
      /\/app\/contracts\/[^/]+\.openapi\.json$/.test(f) ||
      /\/Contracts\/[^/]+\.openapi\.json$/.test(f);
    const formattable = filenames.filter((f) => !isOpenApiSnapshot(f));
    if (formattable.length === 0) return [];
    const formatFiles = formattable.map(esc).join(' ');
    return [`oxfmt --write --no-error-on-unmatched-pattern ${formatFiles}`];
  },
};
