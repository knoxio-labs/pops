/** Approved Trips rail entry and implemented home navigation, in manifest wire format. */
export const TRIPS_NAV = {
  id: 'trips',
  label: 'Trips',
  labelKey: 'trips',
  icon: 'plane',
  basePath: '/trips',
  order: 90,
  items: [{ path: '', label: 'Home', labelKey: 'trips.home', icon: 'layout-dashboard' }],
} as const;
