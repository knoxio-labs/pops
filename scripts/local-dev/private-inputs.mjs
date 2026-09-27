import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Private environment/configuration files prevent receipt reuse: their contents
 * are deliberately never read by the validator. Paths, not values, are returned.
 * @param {string} cwd
 * @param {readonly string[]} unitPaths
 * @returns {string[]}
 */
export function privateInputs(cwd, unitPaths) {
  const files = [];
  for (const directory of [cwd, ...unitPaths.map((unit) => resolve(cwd, unit))]) {
    for (const subdirectory of ['', '.config', '.config/mise', 'mise']) {
      const parent = join(directory, subdirectory);
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        const environment = entry.name.startsWith('.env') && entry.name !== '.env.example';
        const configuration =
          /(?:^|\.)mise.*\.local\.toml$/u.test(entry.name) ||
          /^(?:config|mise)(?:\.[^.]+)?\.local\.toml$/u.test(entry.name);
        if (environment || configuration) files.push(relative(cwd, join(parent, entry.name)));
      }
    }
  }
  return [...new Set(files)].toSorted();
}
