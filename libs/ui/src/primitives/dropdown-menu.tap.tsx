import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

/**
 * Opens the menu from a tap. Radix's trigger opens on `pointerdown` for every
 * pointer type, and the menu is modal (it locks page scroll), so on a phone a
 * swipe that merely started on a trigger — a row's ⋮ button, a table's
 * Columns button — opened a menu and froze the page. Touch and pen now open on
 * `click`, which the browser does not fire for a scroll; a mouse still opens on
 * press, as Radix intends. Radix Select splits mouse from touch the same way.
 *
 * Cancelling the touch `pointerdown` is only how Radix's own handler is told
 * to stand down (it skips a default-prevented event). It does not cost the
 * tap its `click`: the Pointer Events spec suppresses only the compatibility
 * mouse events (`mousedown`, `mouseup`, `mousemove`), and `click` is not one.
 * `pillars/shell/e2e/shell-mobile.spec.ts` taps and swipes a real trigger.
 */
interface TapToggle {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TapToggleContext = React.createContext<TapToggle | null>(null);

export function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );
  const tapToggle = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <TapToggleContext.Provider value={tapToggle}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </TapToggleContext.Provider>
  );
}

export function DropdownMenuTrigger({
  onPointerDown,
  onClick,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const tapToggle = React.useContext(TapToggleContext);
  // Whether the menu was open when the tap began, or null for a mouse press.
  // Read at press time because a non-modal menu's outside-press dismissal can
  // close it between this pointerdown and the click that follows it.
  const openAtTouchPress = React.useRef<boolean | null>(null);

  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      onPointerDown={(event) => {
        onPointerDown?.(event);
        const touch = tapToggle !== null && event.pointerType !== 'mouse';
        openAtTouchPress.current = touch ? tapToggle.open : null;
        // A default-prevented event is one Radix's own handler skips.
        if (touch) event.preventDefault();
      }}
      onClick={(event) => {
        onClick?.(event);
        const wasOpen = openAtTouchPress.current;
        openAtTouchPress.current = null;
        if (tapToggle === null || wasOpen === null) return;
        if (!event.defaultPrevented && !props.disabled) tapToggle.setOpen(!wasOpen);
      }}
      {...props}
    />
  );
}
