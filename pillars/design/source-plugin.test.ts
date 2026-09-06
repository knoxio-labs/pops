import { describe, expect, it } from 'vitest';

import { isSurfaceModule, SOURCE_ATTRIBUTE, stampSource } from './source-plugin';

describe('SURFACE', () => {
  it('matches screens, experiments, and kit', () => {
    expect(isSurfaceModule('/repo/pillars/design/src/screens/finance/account.tsx')).toBe(true);
    expect(isSurfaceModule('/repo/pillars/design/src/experiments/foo.tsx')).toBe(true);
    expect(isSurfaceModule('/repo/pillars/design/src/kit/account-dashboard.tsx')).toBe(true);
  });

  it('does not match other design-surface directories', () => {
    expect(isSurfaceModule('/repo/pillars/design/src/comments/anchors.ts')).toBe(false);
    expect(isSurfaceModule('/repo/pillars/design/src/shell/FrameShell.tsx')).toBe(false);
    expect(isSurfaceModule('/repo/pillars/design/source-plugin.ts')).toBe(false);
  });
});

describe('stampSource', () => {
  const repoRoot = '/repo';

  it('stamps a host element in a kit component with its file and line', () => {
    const id = '/repo/pillars/design/src/kit/account-dashboard-header.tsx';
    const code = [
      'export function Header() {',
      '  return (',
      '    <h1>Everyday</h1>',
      '  );',
      '}',
    ].join('\n');

    const result = stampSource(repoRoot, id, code);

    expect(result?.code).toContain(
      `${SOURCE_ATTRIBUTE}="pillars/design/src/kit/account-dashboard-header.tsx:3"`
    );
  });

  it('does not stamp a component reference, only the host element it renders', () => {
    const id = '/repo/pillars/design/src/kit/account-dashboard-header.tsx';
    const code = [
      'export function Header() {',
      '  return (',
      '    <Badge><span>AUD</span></Badge>',
      '  );',
      '}',
    ].join('\n');

    const result = stampSource(repoRoot, id, code);

    expect(result?.code).not.toMatch(new RegExp(`<Badge[^>]*${SOURCE_ATTRIBUTE}`));
    expect(result?.code).toContain(`<span ${SOURCE_ATTRIBUTE}=`);
  });

  it('leaves modules outside the surface untouched', () => {
    const id = '/repo/pillars/design/src/comments/anchors.ts';

    expect(stampSource(repoRoot, id, 'export const x = 1;')).toBeNull();
  });
});
