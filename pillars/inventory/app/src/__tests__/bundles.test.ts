import { describe, expect, it } from 'vitest';

import { bundles } from '../bundles';
import { PAGE_COMPONENTS } from '../routes';
import { allPageSlots } from './page-slots';

/**
 * The shell's loader looks a `PageDescriptor.bundleSlot` up in this record and
 * throws when it is absent, so a slot the pillar advertises and the bundle
 * does not carry is a page that fails to mount for whoever navigates there
 * first. Both directions matter: an orphan component is dead weight, a slot
 * with nothing behind it is a dead link.
 */
describe('inventory bundles record', () => {
  it('carries exactly the slots the pillar manifest advertises, nested ones included', () => {
    const declared = [...new Set(allPageSlots())].toSorted();
    expect(Object.keys(bundles).toSorted()).toEqual(declared);
  });

  it('carries the redirect slots', () => {
    const slots = Object.keys(bundles);
    expect(slots).toContain('inventory-warranties-redirect');
    expect(slots).toContain('inventory-activity-redirect');
    expect(slots).toContain('inventory-insurance-report-redirect');
    expect(Object.keys(bundles)).toContain('inventory-report-redirect');
  });

  it('resolves every slot to a component', () => {
    for (const slot of Object.keys(bundles)) {
      const component = bundles[slot as keyof typeof bundles];
      expect(component, slot).toBeDefined();
      expect(['function', 'object'], slot).toContain(typeof component);
    }
  });

  // Deduped, because two paths share `inventory-item-form` — the same edit
  // form under `items/new` and `items/:id/edit`.
  it('binds a distinct component to every slot', () => {
    expect(new Set(Object.values(bundles)).size).toBe(new Set(allPageSlots()).size);
  });

  it('is the route table’s component map, not a copy of it', () => {
    expect(bundles).toBe(PAGE_COMPONENTS);
  });
});
