import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Scans only files written by the current Maestro run for exact pairing
 * material held by the harness in memory.
 *
 * @param {{ root: string, afterMs: number, materials: Array<{ code: string, pairingUrl: string }> }} options
 * @returns {Promise<{ scannedFiles: number, filesWithPairingMaterial: number } >}
 */
export async function scanPairingArtifacts({ root, afterMs, materials }) {
  if (materials.length === 0) return { scannedFiles: 0, filesWithPairingMaterial: 0 };
  const variants = new Set(materials.flatMap(pairingMaterialVariants));
  let scannedFiles = 0;
  let filesWithPairingMaterial = 0;

  /** @param {string} directory */
  async function scanDirectory(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingPath(error)) return;
      throw new Error('ios-e2e could not inspect Maestro artifacts.', { cause: error });
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(path);
      } else if (entry.isFile()) {
        let modifiedAt;
        try {
          modifiedAt = (await stat(path)).mtimeMs;
        } catch {
          throw new Error('ios-e2e could not inspect Maestro artifacts.');
        }
        if (modifiedAt < afterMs) continue;

        let contents;
        try {
          contents = await readFile(path);
        } catch {
          throw new Error('ios-e2e could not inspect Maestro artifacts.');
        }
        scannedFiles += 1;
        if ([...variants].some((variant) => contents.includes(Buffer.from(variant, 'utf8')))) {
          filesWithPairingMaterial += 1;
        }
      }
    }
  }

  await scanDirectory(root);
  return { scannedFiles, filesWithPairingMaterial };
}

/** @param {{ code: string, pairingUrl: string }} material */
function pairingMaterialVariants({ code, pairingUrl }) {
  return [
    code,
    encodeURIComponent(code),
    code.replaceAll('-', ''),
    Buffer.from(code, 'utf8').toString('base64'),
    pairingUrl,
    encodeURIComponent(pairingUrl),
  ];
}

/** @param {unknown} error @returns {boolean} */
function isMissingPath(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
