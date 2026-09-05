/**
 * The institutions accounts belong to. A real account carries a real logo;
 * this is a design fixture, so the marks are generic shapes drawn here rather
 * than anyone's trademark — enough to show what the logo path looks like, and
 * what happens on the accounts that have none.
 */
export interface Institution {
  id: string;
  name: string;
  /** A data-URI mark, when one has been uploaded. Absent is the common case. */
  logo?: string;
  /** Brand colour, painted behind the initials when there is no logo. */
  colour: string;
}

function mark(colour: string, shape: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">` +
    `<rect width="40" height="40" rx="8" fill="${colour}"/>${shape}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const institutions: Institution[] = [
  {
    id: 'anz',
    name: 'ANZ',
    colour: '#0072ac',
    logo: mark(
      '#0072ac',
      '<circle cx="20" cy="20" r="9" fill="none" stroke="#fff" stroke-width="4"/>'
    ),
  },
  {
    id: 'amex',
    name: 'American Express',
    colour: '#1c6fba',
    logo: mark('#1c6fba', '<path d="M11 27 20 11l9 16z" fill="#fff"/>'),
  },
  { id: 'ing', name: 'ING', colour: '#ff6200' },
  { id: 'paylab', name: 'PayLab', colour: '#7b4bd6' },
  { id: 'up', name: 'Up', colour: '#ff7a64' },
];

export const institutionsById = new Map(institutions.map((i) => [i.id, i]));

/** Two letters, for the institutions and accounts with no logo. */
export function initials(name: string): string {
  const [first, second] = name.split(/\s+/u).filter(Boolean);
  if (first && second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
