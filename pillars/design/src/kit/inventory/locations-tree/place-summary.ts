/**
 * A place's counts as one line of words, for the Locations panel and the
 * location page header. Empty parts are left out rather than written as
 * zeroes.
 */
import type { PlaceTally } from './tree-model';

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 places inside, 1 thing here, 2 boxes holding 5 things", or "Empty". */
export function placeSummary(tally: PlaceTally): string {
  const parts: string[] = [];
  if (tally.places > 0) parts.push(`${count(tally.places, 'place', 'places')} inside`);
  if (tally.itemsHere > 0) parts.push(`${count(tally.itemsHere, 'thing', 'things')} here`);
  if (tally.boxesHere > 0) {
    const holding =
      tally.inBoxes > 0 ? ` holding ${count(tally.inBoxes, 'thing', 'things')}` : ', empty';
    parts.push(`${count(tally.boxesHere, 'box', 'boxes')}${holding}`);
  }
  return parts.length === 0 ? 'Empty' : parts.join(', ');
}
