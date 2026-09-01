/**
 * The vocabulary picker inside `GroupTagBar` — an input, a facet-grouped
 * dropdown, and the keyboard handling that keeps the two in agreement.
 */
import { describeTag, groupTagsByFacet, type TagCreationIntent } from '../../../lib/tags';
import { FacetHeading } from '../../tags/TagChip';
import { TagCreationRow } from '../../tags/TagCreationRow';

export interface PickerInputProps {
  inputValue: string;
  /** Matches shown in the dropdown: capped, then ordered by facet. */
  filtered: string[];
  /**
   * The vocabulary tag the typed text names, resolved against the whole
   * vocabulary rather than the visible matches — neither the display cap nor
   * the value-only labelling may turn Enter on an existing tag into the
   * creation of a near-duplicate.
   */
  exactMatch: string | undefined;
  /** What the typed text would create, when it names no existing tag. */
  creation: TagCreationIntent;
  showPicker: boolean;
  onAddTag: (tag: string) => void;
  setInputValue: (v: string) => void;
  setShowPicker: (v: boolean) => void;
}

function handlePickerKeyDown(e: React.KeyboardEvent, props: PickerInputProps): void {
  const { filtered, exactMatch, creation, onAddTag, setInputValue, setShowPicker } = props;
  if (e.key === 'Tab' && filtered.length > 0) {
    e.preventDefault();
    const first = filtered[0];
    if (first) onAddTag(first);
    setShowPicker(false);
    setInputValue('');
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // A bare value is not stored on Enter any more: it names no axis, and the
    // create row below is where one is chosen. Only a tag that already exists,
    // or typed text that already names an open axis, is unambiguous enough.
    const resolved = exactMatch ?? (creation.kind === 'ready' ? creation.tag : undefined);
    if (resolved === undefined) return;
    onAddTag(resolved);
    setShowPicker(false);
    setInputValue('');
    return;
  }
  if (e.key === 'Escape') {
    setShowPicker(false);
    setInputValue('');
  }
}

function PickerOption({ tag, onPick }: { tag: string; onPick: (tag: string) => void }) {
  const { label, ariaLabel, title } = describeTag(tag);
  return (
    <button
      className="w-full min-h-11 min-w-11 text-left px-3 py-1 text-xs hover:bg-accent transition-colors"
      title={title}
      aria-label={ariaLabel}
      data-tag={tag}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(tag);
      }}
    >
      {label}
    </button>
  );
}

function PickerOptions({
  filtered,
  onPick,
}: {
  filtered: string[];
  onPick: (tag: string) => void;
}) {
  return (
    <>
      {groupTagsByFacet(filtered).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <FacetHeading className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold px-3 pt-1.5 pb-0.5">
            {group.label}
          </FacetHeading>
          {group.tags.map((parsed) => (
            <PickerOption key={parsed.raw} tag={parsed.raw} onPick={onPick} />
          ))}
        </div>
      ))}
    </>
  );
}

export function PickerInput(
  props: PickerInputProps & { containerRef: React.RefObject<HTMLDivElement | null> }
) {
  const {
    containerRef,
    inputValue,
    setInputValue,
    setShowPicker,
    showPicker,
    filtered,
    creation,
    onAddTag,
  } = props;
  const handlePick = (tag: string) => {
    onAddTag(tag);
    setShowPicker(false);
    setInputValue('');
  };
  return (
    <div ref={containerRef} className="relative">
      <input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setShowPicker(true);
        }}
        onFocus={() => setShowPicker(true)}
        onKeyDown={(e) => handlePickerKeyDown(e, props)}
        placeholder="+ Add tag…"
        className="text-xs border border-dashed border-border rounded-full px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring w-24"
      />
      {showPicker && (filtered.length > 0 || creation.kind !== 'none') && (
        <div className="absolute top-full left-0 mt-1 z-10 bg-popover border rounded-md shadow-md py-1 min-w-32 max-h-40 overflow-y-auto">
          {filtered.length > 0 && <PickerOptions filtered={filtered} onPick={handlePick} />}
          {creation.kind !== 'none' && (
            <div className="px-3 py-1.5 border-t first:border-t-0">
              <TagCreationRow creation={creation} onAddTag={handlePick} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
