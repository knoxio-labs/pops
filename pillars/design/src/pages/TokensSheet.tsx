import { useEffect, useState } from 'react';

/**
 * The token groups `libs/ui/src/theme/globals.css` defines. Listed here
 * rather than read from the stylesheet because a CSS custom property has no
 * enumerable registry: the sheet shows what the theme layer documents, with
 * the value each resolves to under the frame's current theme.
 */
const GROUPS: { title: string; tokens: string[] }[] = [
  {
    title: 'Surfaces',
    tokens: [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
      'border',
      'input',
      'ring',
    ],
  },
  {
    title: 'Actions',
    tokens: [
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'destructive',
      'destructive-foreground',
      'app-accent',
      'app-accent-foreground',
    ],
  },
  {
    title: 'Status',
    tokens: [
      'success',
      'success-foreground',
      'warning',
      'warning-foreground',
      'info',
      'info-foreground',
    ],
  },
  {
    title: 'Charts and stats',
    tokens: [
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
      'chart-5',
      'stat-sky',
      'stat-violet',
      'stat-rose',
      'stat-orange',
    ],
  },
  {
    title: 'Sidebar',
    tokens: [
      'sidebar',
      'sidebar-foreground',
      'sidebar-primary',
      'sidebar-accent',
      'sidebar-border',
    ],
  },
];

/** Resolved values of every listed token, re-read whenever the document's theme classes change. */
function useTokenValues(): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const group of GROUPS) {
        for (const token of group.tokens) next[token] = style.getPropertyValue(`--${token}`).trim();
      }
      next.radius = style.getPropertyValue('--radius').trim();
      next.font = getComputedStyle(document.body).fontFamily.split(',')[0] ?? '';
      setValues(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return values;
}

function TokenRow({ token, value }: { token: string; value: string }) {
  return (
    <li className="flex items-center gap-3 py-1.5 text-sm">
      <span
        aria-hidden
        className="size-8 shrink-0 rounded-md border border-border"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <code className="font-mono text-xs">--{token}</code>
      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
    </li>
  );
}

/** Every colour token under the current canvas theme, plus radius and type. */
export function TokensSheet() {
  const values = useTokenValues();
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold tracking-tight">Tokens</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Resolved from the theme layer for the theme on the canvas. Radius {values.radius}, type{' '}
        {values.font}.
      </p>
      {GROUPS.map((group) => (
        <section key={group.title} className="mb-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </h2>
          <ul className="divide-y divide-border">
            {group.tokens.map((token) => (
              <TokenRow key={token} token={token} value={values[token] ?? ''} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
