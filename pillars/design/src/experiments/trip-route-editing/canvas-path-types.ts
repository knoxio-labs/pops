/** A user-owned alternative section contains any number of movable visits. */
export interface RouteSection {
  id: string;
  gapId: string;
  title: string;
  cards: string[];
}
/** Transport retains explicit visit endpoints independently of its display position. */
export interface TransitLink {
  from: string;
  to: string;
}
