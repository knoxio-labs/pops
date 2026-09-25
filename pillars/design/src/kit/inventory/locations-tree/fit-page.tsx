/**
 * The page the location screens and moving day share: the inventory page
 * frame plus the toast layer their review states draw, and one symbol per
 * kind of place.
 */
import { House, Inbox, MapPin, Sofa, SquareDashed } from 'lucide-react';

import { Toaster } from '@pops/ui';

import { InventoryPage, UndoToast } from '../foundation';

import type { LucideIcon } from 'lucide-react';

import type { InventoryPageProps, LocationKind, UndoToastProps } from '../foundation';

/** One symbol per kind of place, so a room and a drawer do not read alike in the tree. */
export const PLACE_ICONS: Readonly<Record<LocationKind, LucideIcon>> = {
  property: House,
  room: MapPin,
  furniture: Sofa,
  storage: Inbox,
  area: SquareDashed,
};

/** Props for {@link FitPage}. */
export type FitPageProps = Omit<InventoryPageProps, 'overlay'> & {
  /** An undo toast drawn in place, for review states that show one. */
  toast?: UndoToastProps;
};

/** A page that fits the viewport under the POPS chrome, with an undo toast when a state shows one. */
export function FitPage({ toast, ...page }: FitPageProps) {
  return (
    <InventoryPage
      {...page}
      overlay={
        <>
          <Toaster />
          {toast ? (
            <div className="pointer-events-none fixed right-6 bottom-6 z-40 [&>*]:pointer-events-auto">
              <UndoToast {...toast} />
            </div>
          ) : null}
        </>
      }
    />
  );
}
