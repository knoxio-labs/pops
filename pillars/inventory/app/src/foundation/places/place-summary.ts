import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';

function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Formats the server tally used below a place name and in the Locations preview. */
export function placeSummary(tally: PlaceTally): string {
  const parts: string[] = [];
  if (tally.places > 0) parts.push(`${count(tally.places, 'place', 'places')} inside`);
  if (tally.itemsHere > 0) parts.push(`${count(tally.itemsHere, 'thing', 'things')} here`);
  if (tally.boxesHere > 0) {
    const contents =
      tally.inBoxes > 0 ? ` holding ${count(tally.inBoxes, 'thing', 'things')}` : ', empty';
    parts.push(`${count(tally.boxesHere, 'box', 'boxes')}${contents}`);
  }
  return parts.length === 0 ? 'Empty' : parts.join(', ');
}
