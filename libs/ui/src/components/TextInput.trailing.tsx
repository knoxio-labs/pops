import { type ReactNode } from 'react';

export function TrailingSlot({
  showClearButton,
  suffix,
  onClear,
}: {
  showClearButton: boolean;
  suffix?: ReactNode;
  onClear: () => void;
}) {
  if (showClearButton) {
    return (
      <button
        type="button"
        onClick={onClear}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1 min-w-11 min-h-11 inline-flex items-center justify-center"
        aria-label="Clear input"
        tabIndex={-1}
      >
        <XIcon />
      </button>
    );
  }
  if (suffix) return <span className="flex-shrink-0 text-muted-foreground">{suffix}</span>;
  return null;
}

/**
 * X icon for clear button
 */
function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
