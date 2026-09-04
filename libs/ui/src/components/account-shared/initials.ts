/** Two letters, for an institution mark with no logo. */
export function initials(name: string): string {
  const [first, second] = name.split(/\s+/u).filter(Boolean);
  if (first && second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
