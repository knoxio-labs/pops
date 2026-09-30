#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = 'clients/ios/App/AppIcon.icon';
const generatorPath = 'scripts/pwa-app-icon.mjs';
const publicDirectory = 'pillars/shell/public/icons';
const metadataPath = `${publicDirectory}/generation.json`;
const renditions = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

/** @typedef {{ generated_by: string, source: string, source_files: string[], source_sha256: string, generator_sha256: string, renderer: { tool: string, platform: string, rendition: string, design_generation: number, source_size: number }, outputs: { name: string, size: number }[] }} GenerationMetadata */

/** @param {string} directory @returns {string[]} */
function filesUnder(directory) {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(path) : [path];
    })
    .toSorted();
}

/** @param {readonly string[]} paths @returns {string} */
function digestFiles(paths) {
  const digest = createHash('sha256');
  for (const path of paths) {
    digest.update(path.replaceAll(sep, '/'));
    digest.update('\0');
    digest.update(readFileSync(join(repoRoot, path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** @returns {GenerationMetadata} */
function generationMetadata() {
  const sourceFiles = filesUnder(sourceDirectory);
  return {
    generated_by: generatorPath,
    source: sourceDirectory,
    source_files: sourceFiles,
    source_sha256: digestFiles(sourceFiles),
    generator_sha256: digestFiles([generatorPath]),
    renderer: {
      tool: 'Icon Composer ictool',
      platform: 'iOS',
      rendition: 'Default',
      design_generation: 27,
      source_size: 1024,
    },
    outputs: renditions,
  };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is GenerationMetadata} */
function isGenerationMetadata(value) {
  if (!isRecord(value) || !isRecord(value.renderer)) return false;
  return (
    typeof value.generated_by === 'string' &&
    typeof value.source === 'string' &&
    typeof value.source_sha256 === 'string' &&
    typeof value.generator_sha256 === 'string' &&
    Array.isArray(value.source_files) &&
    value.source_files.every(/** @param {unknown} path */ (path) => typeof path === 'string') &&
    typeof value.renderer.tool === 'string' &&
    typeof value.renderer.platform === 'string' &&
    typeof value.renderer.rendition === 'string' &&
    typeof value.renderer.design_generation === 'number' &&
    typeof value.renderer.source_size === 'number' &&
    Array.isArray(value.outputs) &&
    value.outputs.every(
      /** @param {unknown} output */ (output) =>
        isRecord(output) && typeof output.name === 'string' && typeof output.size === 'number'
    )
  );
}

/** @param {string} path @returns {{ width: number, height: number }} */
function pngDimensions(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${path} is not a PNG file`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verify() {
  const expected = generationMetadata();
  const actual = /** @type {unknown} */ (
    JSON.parse(readFileSync(join(repoRoot, metadataPath), 'utf8'))
  );
  if (!isGenerationMetadata(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${metadataPath} is stale; run mise run icon:pwa`);
  }
  for (const output of renditions) {
    const path = join(repoRoot, publicDirectory, output.name);
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const dimensions = pngDimensions(path);
    if (dimensions.width !== output.size || dimensions.height !== output.size) {
      throw new Error(`${path} must be ${output.size}x${output.size}`);
    }
  }
}

function generate() {
  const developerDirectory = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim();
  const iconTool = resolve(
    developerDirectory,
    '..',
    'Applications',
    'Icon Composer.app',
    'Contents',
    'Executables',
    'ictool'
  );
  if (!existsSync(iconTool)) throw new Error('Icon Composer ictool is unavailable');

  const temporaryDirectory = join(repoRoot, 'tmp/pwa-app-icon');
  const sourceImage = join(temporaryDirectory, 'default.png');
  const outputDirectory = join(repoRoot, publicDirectory);
  mkdirSync(temporaryDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });

  execFileSync(
    iconTool,
    [
      join(repoRoot, sourceDirectory),
      '--export-image',
      '--output-file',
      sourceImage,
      '--platform',
      'iOS',
      '--rendition',
      'Default',
      '--width',
      '1024',
      '--height',
      '1024',
      '--scale',
      '1',
      '--design-generation',
      '27',
    ],
    { stdio: 'inherit' }
  );

  for (const output of renditions) {
    execFileSync(
      'sips',
      [
        '-z',
        String(output.size),
        String(output.size),
        sourceImage,
        '--out',
        join(outputDirectory, output.name),
      ],
      { stdio: 'inherit' }
    );
  }
  writeFileSync(join(repoRoot, metadataPath), `${JSON.stringify(generationMetadata(), null, 2)}\n`);
  verify();
}

/** @param {string[]} argv @returns {number} */
function main(argv) {
  const check = argv.includes('--check');
  const unexpected = argv.filter((argument) => argument !== '--check');
  if (unexpected.length > 0) {
    console.error(`usage: node ${generatorPath} [--check]`);
    return 2;
  }
  try {
    if (check) verify();
    else generate();
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
