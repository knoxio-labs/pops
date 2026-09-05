import type { ReactNode } from 'react';

/**
 * Facsimiles of the DesignSystem primitives a form or a photographed page is
 * built from — `PopsTextField`, `PopsPhoto`, `PopsDivider`. Same rules as
 * `primitives.tsx`: named after the Swift so a design can be handed over in
 * one sentence, sharing no code with it.
 *
 * Nothing here types. `focused` and the note are props because a design
 * surface shows a state rather than reaching one.
 */
export type FieldNote = { kind: 'hint' | 'problem'; text: string };

const NOTE_COLOUR = { hint: 'var(--ios-warning)', problem: 'var(--ios-destructive)' } as const;

/**
 * `PopsTextField`: underlined rather than boxed, because the screens that use
 * it are read against paper in the reader's hand and a column of filled
 * rectangles turns a receipt into a settings screen. The rule carries the
 * state, never the value — a value tinted red reads as the thing that is
 * wrong, when what is wrong is that it is missing.
 */
export function PopsTextField({
  label,
  placeholder,
  value,
  type = 'ios-body',
  align = 'left',
  focused = false,
  note,
}: {
  label?: string;
  placeholder: string;
  value?: string;
  type?: string;
  align?: 'left' | 'right';
  focused?: boolean;
  note?: FieldNote;
}) {
  const problem = note?.kind === 'problem';
  const empty = value === undefined || value === '';
  return (
    <div className="min-w-0 flex-1 space-y-1">
      {label === undefined ? null : (
        <p className="ios-section-label" style={{ color: 'var(--ios-muted-foreground)' }}>
          {label}
        </p>
      )}
      <p
        className={`${type} min-h-11 truncate pt-1.5`}
        style={{
          textAlign: align,
          color: empty ? 'var(--ios-muted-foreground)' : 'var(--ios-foreground)',
        }}
      >
        {empty ? placeholder : value}
      </p>
      <Rule focused={focused} problem={problem} />
      {note === undefined ? null : (
        <p className="ios-caption" style={{ color: NOTE_COLOUR[note.kind] }}>
          {note.text}
        </p>
      )}
    </div>
  );
}

/**
 * The rule under the value, which is the only thing that changes: accent while
 * the field has focus, destructive while the value is not usable, and twice as
 * thick in either case so the state survives a colour-blind reading.
 */
function Rule({ focused, problem }: { focused: boolean; problem: boolean }) {
  if (focused) return <Line colour="var(--ios-accent)" emphasis />;
  if (problem) return <Line colour="var(--ios-destructive)" emphasis />;
  return <Line colour="var(--ios-separator)" />;
}

function Line({ colour, emphasis = false }: { colour: string; emphasis?: boolean }) {
  return <div aria-hidden style={{ borderTop: `${emphasis ? 2 : 1}px solid ${colour}` }} />;
}

/** `PopsDivider`: the hairline between two groups, in `popsSeparator`. */
export function PopsDivider() {
  return <div aria-hidden style={{ borderTop: '1px solid var(--ios-separator)' }} />;
}

/**
 * `PopsPhoto`: a plate that holds a photographed page, or the glyph standing
 * in for one that has not been taken. `PopsSize.pageWidth`/`pageHeight` are
 * 116×168, which is the size the app draws a page at.
 */
export function PopsPhoto({
  glyph,
  label,
  children,
}: {
  glyph: ReactNode;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{
        width: 116,
        height: 168,
        background: 'var(--ios-surface)',
        border: '1px solid var(--ios-separator)',
        color: 'var(--ios-muted-foreground)',
      }}
    >
      {children ?? glyph}
    </div>
  );
}
