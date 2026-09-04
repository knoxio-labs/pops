const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * The software keyboard, drawn only so a sheet is judged against the height it
 * actually has. 291pt is an iPhone 15's keyboard with no predictive bar; a
 * picker that looks roomy at 852pt has less than half of it the moment the
 * search field takes focus, which is the state the picker is used in.
 *
 * A block of keys, not a working keyboard: nothing here types.
 */
export function IosKeyboard() {
  return (
    <div
      aria-hidden
      className="flex flex-col justify-center gap-2 px-1 pb-6"
      style={{ height: 291, background: 'var(--ios-surface)' }}
    >
      {ROWS.map((row) => (
        <div key={row} className="flex justify-center gap-1.5">
          {Array.from(row).map((key) => (
            <span
              key={key}
              className="ios-body flex h-10 w-8 items-center justify-center rounded-[5px]"
              style={{ background: 'var(--ios-background)' }}
            >
              {key}
            </span>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        <span
          className="ios-caption flex h-10 flex-1 items-center justify-center rounded-[5px]"
          style={{ background: 'var(--ios-background)' }}
        >
          space
        </span>
        <span
          className="ios-caption flex h-10 w-20 items-center justify-center rounded-[5px]"
          style={{ background: 'var(--ios-accent)', color: 'var(--ios-background)' }}
        >
          search
        </span>
      </div>
    </div>
  );
}
