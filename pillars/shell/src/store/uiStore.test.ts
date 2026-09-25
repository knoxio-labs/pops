/**
 * Tests for UI store — sidebar and rail state
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: false, railOpen: true });
  });

  describe('sidebarOpen', () => {
    it('should default to false so a phone does not land on an open drawer', () => {
      expect(useUIStore.getInitialState().sidebarOpen).toBe(false);
    });

    it('should toggle sidebar', () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('should set sidebar open directly', () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('railOpen', () => {
    it('should default to true', () => {
      expect(useUIStore.getState().railOpen).toBe(true);
    });

    it('should toggle rail', () => {
      useUIStore.getState().toggleRail();
      expect(useUIStore.getState().railOpen).toBe(false);

      useUIStore.getState().toggleRail();
      expect(useUIStore.getState().railOpen).toBe(true);
    });

    it('should set rail open directly', () => {
      useUIStore.getState().setRailOpen(false);
      expect(useUIStore.getState().railOpen).toBe(false);

      useUIStore.getState().setRailOpen(true);
      expect(useUIStore.getState().railOpen).toBe(true);
    });
  });

  it('sidebar and rail states are independent', () => {
    useUIStore.getState().setSidebarOpen(false);
    expect(useUIStore.getState().railOpen).toBe(true);

    useUIStore.getState().setRailOpen(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(useUIStore.getState().railOpen).toBe(false);
  });

  describe('persistence', () => {
    beforeEach(() => localStorage.clear());

    it('does not persist sidebarOpen', () => {
      useUIStore.getState().setSidebarOpen(true);
      const stored = JSON.parse(localStorage.getItem('pops-ui-storage') ?? '{}');
      expect(stored.state).toEqual({ railOpen: true });
    });

    it('ignores a stale sidebarOpen written by an older build', async () => {
      localStorage.setItem(
        'pops-ui-storage',
        JSON.stringify({ state: { sidebarOpen: true, railOpen: false }, version: 0 })
      );
      await useUIStore.persist.rehydrate();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      expect(useUIStore.getState().railOpen).toBe(false);
    });
  });
});
