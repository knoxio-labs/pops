import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buttonVariants } from './button';
import { Checkbox } from './checkbox';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Switch } from './switch';
import { Tabs, TabsList, TabsTrigger } from './tabs';

/**
 * Touch target audit tests
 * Verifies all interactive element variants meet 44x44px minimum touch target.
 *
 * Strategy: check that CVA class strings include the right Tailwind utilities.
 * - h-11 / size-11 = 44px (meets minimum directly)
 * - before:-inset-X pseudo-element expands touch area beyond visual element
 *   e.g. h-6 (24px) + before:-inset-2.5 (10px each side) = 44px
 *
 * Checkbox/RadioGroupItem/Switch/TabsTrigger apply their sizing classes as a
 * static string rather than through a CVA variant function, so those sections
 * render the real component and assert on the mounted element's className —
 * a regression that drops the expansion utility fails here, not just a
 * design-time read of the source.
 */

describe('Touch target audit', () => {
  describe('Button primitive', () => {
    it('default size meets 44px via h-11', () => {
      const classes = buttonVariants({ size: 'default' });
      expect(classes).toContain('h-11');
    });

    it('lg size meets 44px via h-11', () => {
      const classes = buttonVariants({ size: 'lg' });
      expect(classes).toContain('h-11');
    });

    it('icon size meets 44px via size-11', () => {
      const classes = buttonVariants({ size: 'icon' });
      expect(classes).toContain('size-11');
    });

    it('icon-lg size meets 44px via size-11', () => {
      const classes = buttonVariants({ size: 'icon-lg' });
      expect(classes).toContain('size-11');
    });

    it('xs size (24px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'xs' });
      expect(classes).toContain('h-6');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-2.5');
      expect(classes).toContain("before:content-['']");
    });

    it('sm size (32px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'sm' });
      expect(classes).toContain('h-8');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1.5');
      expect(classes).toContain("before:content-['']");
    });

    it('icon-xs size (32px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'icon-xs' });
      expect(classes).toContain('size-8');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1.5');
      expect(classes).toContain("before:content-['']");
    });

    it('icon-sm size (36px) has invisible touch target via before pseudo-element', () => {
      const classes = buttonVariants({ size: 'icon-sm' });
      expect(classes).toContain('size-9');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-1');
      expect(classes).toContain("before:content-['']");
    });

    it('all button sizes have relative positioning for pseudo-element', () => {
      const sizes = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;
      for (const size of sizes) {
        const classes = buttonVariants({ size });
        expect(classes, `size="${size}" should have relative positioning`).toContain('relative');
      }
    });
  });

  describe('Checkbox primitive', () => {
    it('is a visually-compact size-4 control with an invisible before:-inset-3.5 touch target', () => {
      const { getByRole } = render(<Checkbox />);
      const classes = getByRole('checkbox').className;
      expect(classes).toContain('size-4');
      expect(classes).toContain('relative');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-3.5');
      expect(classes).toContain("before:content-['']");
    });
  });

  describe('RadioGroupItem primitive', () => {
    it('is a visually-compact size-4 control with an invisible before:-inset-3.5 touch target', () => {
      const { getByRole } = render(
        <RadioGroup>
          <RadioGroupItem value="a" />
        </RadioGroup>
      );
      const classes = getByRole('radio').className;
      expect(classes).toContain('size-4');
      expect(classes).toContain('relative');
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-3.5');
      expect(classes).toContain("before:content-['']");
    });
  });

  describe('Switch primitive', () => {
    it('default size has an invisible before:-inset-3.5 touch target', () => {
      const { getByRole } = render(<Switch />);
      const classes = getByRole('switch').className;
      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-inset-3.5');
      expect(classes).toContain("before:content-['']");
    });

    it('sm size has a wider before:-inset-4 touch target to compensate for the smaller track', () => {
      const { getByRole } = render(<Switch size="sm" />);
      const classes = getByRole('switch').className;
      expect(classes).toContain('data-[size=sm]:before:-inset-4');
    });
  });

  describe('TabsTrigger primitive', () => {
    it('meets the 44px minimum via min-w-11 width and the h-11 tab-list height', () => {
      const { getByRole } = render(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      const trigger = getByRole('tab').className;
      expect(trigger).toContain('min-w-11');
      // The trigger fills its TabsList container's height; TabsList itself
      // carries the h-11 that gives the trigger its 44px vertical extent.
      const list = getByRole('tablist').className;
      expect(list).toContain('h-11');
    });
  });
});
