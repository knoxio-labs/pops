import { useEffect, useState } from 'react';

import {
  SETTINGS_HEADER_OFFSET_DESKTOP,
  SETTINGS_HEADER_OFFSET_MOBILE,
  SETTINGS_MD_BREAKPOINT,
} from './constants';

import type { SettingsManifest } from '@pops/types';

export function useSectionObserver(manifests: SettingsManifest[]) {
  const [activeId, setActiveId] = useState<string>('');

  // Only initialize once (when activeId is still empty) so tRPC refetches
  // never overwrite scroll-derived state.
  useEffect(() => {
    if (!manifests.length || activeId) return;
    const hash = window.location.hash.slice(1);
    const hasValidHash = hash !== '' && manifests.some((m) => m.id === hash);
    setActiveId(hasValidHash ? hash : (manifests[0]?.id ?? ''));
  }, [activeId, manifests]);

  useEffect(() => {
    if (!manifests.length) return;
    // Cache elements once so the scroll handler avoids repeated DOM queries
    const elements = manifests.map((m) => document.getElementById(m.id));
    let rafId: number | null = null;
    const update = () => {
      const offset = window.matchMedia(SETTINGS_MD_BREAKPOINT).matches
        ? SETTINGS_HEADER_OFFSET_DESKTOP
        : SETTINGS_HEADER_OFFSET_MOBILE;
      let current = manifests[0]?.id ?? '';
      for (let i = 0; i < manifests.length; i++) {
        const el = elements[i];
        const manifest = manifests[i];
        if (!el || !manifest) continue;
        if (el.getBoundingClientRect().top <= offset) current = manifest.id;
      }
      setActiveId(current);
      rafId = null;
    };
    const onScroll = () => {
      if (rafId === null) rafId = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [manifests]);

  return activeId;
}
