import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** @typedef {'preflight' | 'fixtures' | 'bfm-startup' | 'mcp-startup' | 'mcp-readiness' | 'ios-e2e' | 'artifact-scan' | 'complete'} PairingRunPhase */
/** @typedef {'required-root-missing' | 'required-root-no-new-files' | 'root-read-failed' | 'file-stat-failed' | 'file-read-failed'} PairingArtifactScanFailureStage */
/** @typedef {'not-run' | 'clean' | 'matched' | 'failed'} PairingArtifactScanOutcome */

/** A pairing-artifact scan failure with a static stage and no file path or contents. */
export class PairingArtifactScanFailure extends Error {
  /**
   * @param {PairingArtifactScanFailureStage} stage
   * @param {number} scannedFiles
   * @param {number} scannedRoots
   * @param {number} totalRoots
   */
  constructor(stage, scannedFiles, scannedRoots, totalRoots) {
    super('ios-e2e could not inspect pairing artifacts.');
    this.name = 'PairingArtifactScanFailure';
    this.stage = stage;
    this.scannedFiles = scannedFiles;
    this.scannedRoots = scannedRoots;
    this.totalRoots = totalRoots;
  }
}

/**
 * Formats the value-free lifecycle evidence emitted before fixture cleanup
 * when an iOS E2E run fails.
 *
 * @param {{ phase: PairingRunPhase, issuedCount: number, claimedCount: number, completedCount: number, pairedCount: number, scannedRoots: number, totalRoots: number, scannedFiles: number, artifactScan: PairingArtifactScanOutcome, artifactScanStage: PairingArtifactScanFailureStage | 'unknown' | null }} summary
 * @returns {string}
 */
export function formatPairingRunLifecycleSummary({
  phase,
  issuedCount,
  claimedCount,
  completedCount,
  pairedCount,
  scannedRoots,
  totalRoots,
  scannedFiles,
  artifactScan,
  artifactScanStage,
}) {
  return `ios-e2e: lifecycle failure phase=${phase} issued=${issuedCount} claims=${claimedCount} completions=${completedCount} paired=${pairedCount} scannedRoots=${scannedRoots}/${totalRoots} scannedFiles=${scannedFiles} artifactScan=${artifactScan} artifactScanStage=${artifactScanStage ?? 'none'}.\n`;
}

/**
 * Keeps the original E2E failure primary when the follow-up artifact scan also fails.
 *
 * @param {unknown} runFailure
 * @param {unknown} artifactScanFailure
 * @returns {unknown}
 */
export function primaryPairingRunFailure(runFailure, artifactScanFailure) {
  return runFailure ?? artifactScanFailure;
}

/**
 * Scans newly written test and selected-simulator logs for pairing material held
 * by the harness in memory.
 *
 * @param {{ root: string, additionalRoots?: string[], requiredRoots?: string[], afterMs: number, materials: Array<{ code: string, pairingUrl: string }> }} options
 * @returns {Promise<{ scannedFiles: number, scannedRoots: number, totalRoots: number, filesWithPairingMaterial: number } >}
 */
export async function scanPairingArtifacts({
  root,
  additionalRoots = [],
  requiredRoots = [],
  afterMs,
  materials,
}) {
  const variants = new Set(materials.flatMap(pairingMaterialVariants));
  const required = new Set(requiredRoots);
  let scannedFiles = 0;
  let scannedRoots = 0;
  let filesWithPairingMaterial = 0;

  /** @param {string} directory @param {boolean} isRequiredRoot */
  async function scanDirectory(directory, isRequiredRoot = false) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingPath(error) && !isRequiredRoot) return false;
      throw new PairingArtifactScanFailure(
        isMissingPath(error) ? 'required-root-missing' : 'root-read-failed',
        scannedFiles,
        scannedRoots,
        1 + additionalRoots.length
      );
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
          throw new PairingArtifactScanFailure(
            'file-stat-failed',
            scannedFiles,
            scannedRoots,
            1 + additionalRoots.length
          );
        }
        if (modifiedAt < afterMs) continue;

        let contents;
        try {
          contents = await readFile(path);
        } catch {
          throw new PairingArtifactScanFailure(
            'file-read-failed',
            scannedFiles,
            scannedRoots,
            1 + additionalRoots.length
          );
        }
        scannedFiles += 1;
        if ([...variants].some((variant) => contents.includes(Buffer.from(variant, 'utf8')))) {
          filesWithPairingMaterial += 1;
        }
      }
    }
    return true;
  }

  for (const scanRoot of [root, ...additionalRoots]) {
    const filesBeforeRoot = scannedFiles;
    if (await scanDirectory(scanRoot, required.has(scanRoot))) scannedRoots += 1;
    if (required.has(scanRoot) && scannedFiles === filesBeforeRoot) {
      throw new PairingArtifactScanFailure(
        'required-root-no-new-files',
        scannedFiles,
        scannedRoots,
        1 + additionalRoots.length
      );
    }
  }
  return {
    scannedFiles,
    scannedRoots,
    totalRoots: 1 + additionalRoots.length,
    filesWithPairingMaterial,
  };
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
