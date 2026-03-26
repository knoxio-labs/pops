# PRD-003 US-01: Create @pops/ui Package Scaffold

**GH Issue:** #394
**Status:** done

## Audit Findings

`packages/ui/` exists with proper scaffold:

**package.json:**
- Name: `@pops/ui`
- Type: ESM module
- Exports: `.` (index.ts), `./theme` (globals.css), `./primitives/*`
- Scripts: typecheck, lint, lint:fix, format:check, format:fix, storybook, build-storybook

**Directory structure:**
```
packages/ui/src/
├── index.ts          # main exports
├── components/       # composite components
├── primitives/       # shadcn/radix primitives
├── lib/              # utilities
└── theme/            # CSS/design tokens
```

Package is part of the pnpm workspace and included in turbo pipeline.
