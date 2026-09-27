/** Router state retained while moving between neighbouring detail pages. */
export interface DetailTrailState {
  listTrail: {
    listName: string;
    href: string;
    ids: readonly string[];
  };
}

/** The current item position in the list that opened its detail page. */
export interface DetailTrailPosition {
  listName: string;
  href: string;
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
  trailState?: DetailTrailState;
}
