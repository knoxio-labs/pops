#!/usr/bin/env node
import { accessSync, constants, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

const requiredTools = ['oxfmt'];

function main(args) {
  const [sourceDirectory, destinationDirectory] = args;
  if (!sourceDirectory || !destinationDirectory || args.length !== 2) {
    process.stderr.write('usage: provision-tools.mjs <source-bin> <destination-bin>\n');
    return 2;
  }

  mkdirSync(destinationDirectory, { recursive: true });
  for (const name of requiredTools) {
    const source = join(sourceDirectory, name);
    try {
      accessSync(source, constants.X_OK);
    } catch {
      process.stderr.write(
        `sandbox: required tool "${name}" is unavailable in the workspace; install workspace dependencies before running EX-2.\n`
      );
      return 1;
    }
    symlinkSync(source, join(destinationDirectory, name));
  }
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
