/**
 * Stamps `data-pops-design-source="<repo-relative file>:<line>"` on every host
 * element the design surface renders, so a comment pinned in the browser
 * carries the file and line a session should open.
 *
 * Scoped to `src/screens`, `src/experiments`, and `src/kit` — the surface and
 * the shared components it's built from. Without kit stamped, the overlay's
 * nearest-ancestor walk skips every subitem inside a shared component and
 * lands on the screen-level wrapper, so only the outer card is ever
 * targetable. The thread's `route` field already records which screen the
 * comment was made on, so a kit-sourced anchor pointing at the kit component
 * doesn't lose that context — it points at the actual markup to edit.
 */
import path from 'node:path';

import { transformSync, type PluginObj } from '@babel/core';

import type * as BabelTypes from '@babel/types';
import type { Plugin } from 'vite';

/** The attribute the overlay's anchor resolver looks for. */
export const SOURCE_ATTRIBUTE = 'data-pops-design-source';

const SURFACE = /\/pillars\/design\/src\/(screens|experiments|kit)\/[^?]+\.tsx$/u;

function stamp(repoRoot: string) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    name: 'pops-design-source-stamp',
    visitor: {
      JSXOpeningElement(nodePath, state) {
        const node = nodePath.node;
        // Lowercase names are host elements. A capitalised one is a component,
        // and stamping it would attribute the comment to the call site rather
        // than to the markup the reader actually clicked.
        if (node.name.type !== 'JSXIdentifier' || !/^[a-z]/u.test(node.name.name)) return;
        if (!node.loc || !state.filename) return;
        const already = node.attributes.some(
          (attribute) =>
            attribute.type === 'JSXAttribute' && attribute.name.name === SOURCE_ATTRIBUTE
        );
        if (already) return;
        const relative = path.relative(repoRoot, state.filename);
        node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier(SOURCE_ATTRIBUTE),
            t.stringLiteral(`${relative}:${node.loc.start.line}`)
          )
        );
      },
    },
  });
}

/** Whether this module id is part of the design surface, and so gets stamped. */
export function isSurfaceModule(id: string): boolean {
  return SURFACE.test(id);
}

export function sourcePlugin(repoRoot: string): Plugin {
  return {
    name: 'pops-design-source',
    enforce: 'pre',
    transform(code, id) {
      if (!isSurfaceModule(id)) return null;
      const result = transformSync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['jsx', 'typescript'] },
        plugins: [stamp(repoRoot)],
        sourceMaps: true,
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}
