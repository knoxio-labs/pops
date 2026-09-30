import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shellDirectory = join(repoRoot, 'pillars/shell');
const publicDirectory = join(repoRoot, 'pillars/shell/public');
const iconDirectory = join(publicDirectory, 'icons');
const generatorPath = join(repoRoot, 'scripts/pwa-app-icon.mjs');

type WebIcon = { src: string; sizes: string; type: string };
type IconGenerationMetadata = {
  generated_by: string;
  source: string;
  source_files: string[];
  source_sha256: string;
  generator_sha256: string;
  renderer: {
    tool: string;
    platform: string;
    rendition: string;
    design_generation: number;
    source_size: number;
  };
  outputs: { name: string; size: number }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWebIcon(value: unknown): value is WebIcon {
  if (!isRecord(value)) return false;
  return (
    'src' in value &&
    typeof value.src === 'string' &&
    'sizes' in value &&
    typeof value.sizes === 'string' &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function isIconGenerationMetadata(value: unknown): value is IconGenerationMetadata {
  if (!isRecord(value) || !isRecord(value.renderer) || !Array.isArray(value.outputs)) return false;
  return (
    typeof value.generated_by === 'string' &&
    typeof value.source === 'string' &&
    typeof value.source_sha256 === 'string' &&
    typeof value.generator_sha256 === 'string' &&
    Array.isArray(value.source_files) &&
    value.source_files.every((path: unknown) => typeof path === 'string') &&
    typeof value.renderer.tool === 'string' &&
    typeof value.renderer.platform === 'string' &&
    typeof value.renderer.rendition === 'string' &&
    typeof value.renderer.design_generation === 'number' &&
    typeof value.renderer.source_size === 'number' &&
    value.outputs.every(
      (output: unknown) =>
        isRecord(output) && typeof output.name === 'string' && typeof output.size === 'number'
    )
  );
}

function webIcons(): WebIcon[] {
  const manifest: unknown = JSON.parse(
    readFileSync(join(publicDirectory, 'manifest.json'), 'utf8')
  );
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('icons' in manifest) ||
    !Array.isArray(manifest.icons) ||
    !manifest.icons.every(isWebIcon)
  ) {
    throw new Error('PWA manifest has invalid icon metadata');
  }
  return manifest.icons;
}

function fileList(directory: string): string[] {
  return readdirSync(join(repoRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? fileList(path) : [path];
    })
    .map((path) => path.split(sep).join('/'))
    .toSorted();
}

function digest(paths: string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(repoRoot, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function pngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${path} is not a PNG file`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('shell PWA icons', { timeout: 10_000 }, () => {
  it.each([
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ])('serves the $size pixel icon declared by the manifest', ({ name, size }) => {
    const icon = webIcons().find((entry) => entry.sizes === `${size}x${size}`);
    expect(icon).toEqual({ src: `/icons/${name}`, sizes: `${size}x${size}`, type: 'image/png' });
    expect(pngDimensions(join(publicDirectory, icon?.src ?? ''))).toEqual({
      width: size,
      height: size,
    });
  });

  it('uses the 192 pixel icon for the favicon and Apple touch icon', () => {
    const html = readFileSync(join(shellDirectory, 'index.html'), 'utf8');
    expect(html).toMatch(/rel="icon"[^>]+href="\/icons\/icon-192\.png"/u);
    expect(html).toMatch(/rel="apple-touch-icon"[^>]+href="\/icons\/icon-192\.png"/u);
  });

  it('records the exact iOS source and renderer used for the committed rasters', () => {
    const metadata: unknown = JSON.parse(
      readFileSync(join(iconDirectory, 'generation.json'), 'utf8')
    );
    if (!isIconGenerationMetadata(metadata)) {
      throw new Error('PWA icon generation metadata is invalid');
    }

    const sourceFiles = fileList('clients/ios/App/AppIcon.icon');
    expect(metadata.generated_by).toBe('scripts/pwa-app-icon.mjs');
    expect(metadata.source).toBe('clients/ios/App/AppIcon.icon');
    expect(metadata.source_files).toEqual(sourceFiles);
    expect(metadata.source_sha256).toBe(digest(sourceFiles));
    expect(metadata.generator_sha256).toBe(digest(['scripts/pwa-app-icon.mjs']));
    expect(metadata.renderer).toEqual({
      tool: 'Icon Composer ictool',
      platform: 'iOS',
      rendition: 'Default',
      design_generation: 27,
      source_size: 1024,
    });
    expect(metadata.outputs).toEqual([
      { name: 'icon-192.png', size: 192 },
      { name: 'icon-512.png', size: 512 },
    ]);
    execFileSync(process.execPath, [generatorPath, '--check'], {
      cwd: repoRoot,
      timeout: 10_000,
    });
  });

  it('rejects unknown generator arguments', () => {
    const result = spawnSync(process.execPath, [generatorPath, '--unexpected'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
  });
});
