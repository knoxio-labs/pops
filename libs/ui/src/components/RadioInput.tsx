/**
 * RadioInput component - Radio group with labels using shadcn primitives
 * Built on @radix-ui/react-radio-group
 */
import { forwardRef, useId, type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { RadioGroup, RadioGroupItem } from '../primitives/radio-group';

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
  /**
   * Content beneath the option, aligned under its label.
   *
   * The radio-card shape: a choice that owns the controls it governs — a list
   * to pick from, a name to type. It is rendered whichever option is
   * selected, and stays mounted when the selection moves, so a half-typed
   * name is not lost by clicking the other choice and back.
   *
   * Additive: an option without one renders exactly as before (POPS-3298).
   */
  body?: ReactNode;
}

/** How large an option's label reads. Matches the kit's other controls. */
export type RadioInputSize = 'sm' | 'default' | 'lg';

/**
 * The label's own type scale.
 *
 * A parent's `text-xs` could not win before this existed: `RadioOptionRow`
 * wrote `text-sm` on the label itself, `className` reached only the outer
 * container, and the child's own class is the more specific one. A compact
 * inline toggle therefore had to hand-compose the primitives, which is the
 * shape ADR-051 exists to remove (POPS-3298).
 */
const LABEL_SIZE: Readonly<Record<RadioInputSize, string>> = {
  sm: 'text-xs',
  default: 'text-sm',
  lg: 'text-base',
};

export interface RadioInputProps {
  /**
   * Radio group name
   */
  name?: string;
  /**
   * Radio options
   */
  options: RadioOption[];
  /**
   * Selected value
   */
  value?: string;
  /**
   * Default value (uncontrolled)
   */
  defaultValue?: string;
  /**
   * Callback when value changes
   */
  onValueChange?: (value: string) => void;
  /**
   * Group label
   */
  label?: string;
  /**
   * Group description
   */
  description?: string;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Required field
   */
  required?: boolean;
  /**
   * Error state
   */
  error?: boolean;
  /**
   * Error message
   */
  errorMessage?: string;
  /**
   * Layout orientation
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * How large the option labels read. `'default'` is `text-sm`.
   */
  size?: RadioInputSize;
  /**
   * Accessible name for the group, when no `label` names it visibly.
   *
   * Declared rather than left to the rest-spread that carries it. It does
   * reach the underlying `RadioGroup` either way — an inline toggle with a
   * visible label elsewhere depends on that — but a props type that does not
   * say so is one a consumer cannot read, and one a later refactor of the
   * spread would break silently.
   */
  'aria-label'?: string;
  /** Accessible name sourced from another element's text. Same reasoning. */
  'aria-labelledby'?: string;
  /**
   * Container className
   */
  className?: string;
}

/**
 * RadioInput component
 *
 * @example
 * ```tsx
 * <RadioInput
 *   label="Select a plan"
 *   options={[
 *     { label: "Free", value: "free", description: "Basic features" },
 *     { label: "Pro", value: "pro", description: "All features" }
 *   ]}
 *   value={plan}
 *   onValueChange={setPlan}
 * />
 * ```
 */
function RadioHeader({
  label,
  description,
  required,
}: {
  label?: string;
  description?: string;
  required?: boolean;
}) {
  if (!label && !description) return null;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function RadioOptionRow({
  option,
  disabled,
  groupId,
  size,
}: {
  option: RadioOption;
  disabled?: boolean;
  groupId: string;
  size: RadioInputSize;
}) {
  const isDisabled = option.disabled ?? disabled;
  const optionId = `${groupId}-${option.value}`;
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem value={option.value} id={optionId} disabled={isDisabled} className="mt-0.5" />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <label
          htmlFor={optionId}
          className={cn(
            LABEL_SIZE[size],
            'font-medium leading-none cursor-pointer select-none',
            isDisabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {option.label}
        </label>
        {option.description && (
          <p className="text-sm text-muted-foreground">{option.description}</p>
        )}
        {option.body !== undefined && <div className="mt-2">{option.body}</div>}
      </div>
    </div>
  );
}

export const RadioInput = forwardRef<HTMLDivElement, RadioInputProps>(
  (
    {
      name,
      options,
      value,
      defaultValue,
      onValueChange,
      label,
      description,
      disabled = false,
      required = false,
      error = false,
      errorMessage,
      orientation = 'vertical',
      size = 'default',
      className,
      ...props
    },
    ref
  ) => {
    const groupId = useId();

    return (
      <div className={cn('flex flex-col gap-3', className)} ref={ref}>
        <RadioHeader label={label} description={description} required={required} />
        <RadioGroup
          name={name}
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          required={required}
          aria-invalid={error}
          className={cn(
            orientation === 'horizontal' ? 'grid gap-3 sm:flex sm:flex-row sm:gap-4' : 'grid gap-3'
          )}
          {...props}
        >
          {options.map((option) => (
            <RadioOptionRow
              key={option.value}
              option={option}
              disabled={disabled}
              groupId={groupId}
              size={size}
            />
          ))}
        </RadioGroup>
        {error && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </div>
    );
  }
);

RadioInput.displayName = 'RadioInput';
