export interface ListTrail {
  readonly listName: string;
  readonly href: string;
  readonly ids: readonly string[];
}

export interface ListTrailState {
  readonly listTrail: ListTrail;
}

/** Creates the router state used to keep an item's originating list while opening its detail page. */
export function listTrailState(trail: ListTrail): ListTrailState {
  return {
    listTrail: {
      listName: trail.listName,
      href: trail.href,
      ids: [...trail.ids],
    },
  };
}
