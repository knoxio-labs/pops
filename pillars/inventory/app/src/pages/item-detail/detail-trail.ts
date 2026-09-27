import type { ListTrail, TrailPosition } from '../../inventory-web/list-trail';

export type DetailTrailState = { listTrail: ListTrail };
export type DetailTrailPosition = TrailPosition & { trailState?: DetailTrailState };
