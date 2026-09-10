import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { setInputValueAndNotify } from '../lib/input-element';

interface UseDragListenersArgs {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  step: number;
  dragStartY: MutableRefObject<number>;
  dragStartValue: MutableRefObject<number>;
  commitValue: (v: number) => void;
}

function useDragListeners({
  isDragging,
  setIsDragging,
  step,
  dragStartY,
  dragStartValue,
  commitValue,
}: UseDragListenersArgs) {
  // `commitValue` closes over `min`/`max`/`onChange` and is rebuilt on every
  // render, so depending on it directly would detach and reattach the document
  // listeners on each committed drag step. Reading it through a ref keeps the
  // listeners mounted for the whole gesture while still calling the latest one.
  const commitValueRef = useRef(commitValue);
  useLayoutEffect(() => {
    commitValueRef.current = commitValue;
  }, [commitValue]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const deltaValue = Math.round(deltaY / 2) * step;
      commitValueRef.current(dragStartValue.current + deltaValue);
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, step, setIsDragging, dragStartY, dragStartValue]);
}

export interface UseNumberInputArgs {
  controlledValue: number | string | readonly string[] | undefined;
  defaultValue: number | string | readonly string[] | undefined;
  min?: number;
  max?: number;
  step: number;
  enableDrag: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function clamp(val: number, min?: number, max?: number): number {
  if (min !== undefined && val < min) return min;
  if (max !== undefined && val > max) return max;
  return val;
}

function isEmptyValue(v: UseNumberInputArgs['controlledValue']): boolean {
  return v === undefined || v === '';
}

/** Coerces a raw prop value to a display value: `''` means "no value entered". */
function toDisplayValue(v: UseNumberInputArgs['controlledValue']): number | '' {
  if (isEmptyValue(v)) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

interface UseValueStateArgs {
  controlledValue: UseNumberInputArgs['controlledValue'];
  defaultValue: UseNumberInputArgs['defaultValue'];
  min?: number;
  max?: number;
  onChange?: UseNumberInputArgs['onChange'];
  inputRef: RefObject<HTMLInputElement | null>;
}

function useValueState({
  controlledValue,
  defaultValue,
  min,
  max,
  onChange,
  inputRef,
}: UseValueStateArgs) {
  const [internalValue, setInternalValue] = useState<number | ''>(() =>
    toDisplayValue(defaultValue)
  );
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? toDisplayValue(controlledValue) : internalValue;
  const isEmpty = value === '';

  /**
   * A stepper click or a drag step. It only writes to the element; the state
   * update and the `onChange` call are {@link handleChange}'s, reached through
   * the event React raises in response — so every path this component emits a
   * change on ends in the same place, with the same event shape.
   *
   * The element is never absent here: both callers are reachable only while
   * the input is mounted, since the steppers render beside it and the drag
   * listeners are installed and torn down by an effect that owns it.
   */
  const commitValue = (next: number) => {
    const input = inputRef.current;
    if (input === null) return;
    setInputValueAndNotify(input, String(clamp(next, min, max)));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === '') {
      if (!isControlled) setInternalValue('');
      onChange?.(e);
      return;
    }
    const newValue = Number(e.target.value);
    if (isNaN(newValue)) return;
    if (!isControlled) setInternalValue(clamp(newValue, min, max));
    onChange?.(e);
  };

  return { value, isEmpty, commitValue, handleChange };
}

export function useNumberInput({
  controlledValue,
  defaultValue,
  min,
  max,
  step,
  enableDrag,
  disabled,
  onChange,
}: UseNumberInputArgs) {
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number>(0);
  const dragStartValue = useRef<number>(0);
  // The hook's own handle on the element, so the steppers and the drag
  // gesture can raise a real change through it. `NumberInput` merges the
  // caller's forwarded ref with this one; neither displaces the other.
  const inputRef = useRef<HTMLInputElement>(null);

  const { value, commitValue, handleChange } = useValueState({
    controlledValue,
    defaultValue,
    min,
    max,
    onChange,
    inputRef,
  });

  // Incrementing/decrementing from an unset value has no principled baseline
  // (0? min? the last cleared value?), so the steppers and drag gesture are
  // disabled until the field holds a real number — see decrementDisabled /
  // incrementDisabled and handleMouseDown below.
  const increment = () => {
    if (value !== '') commitValue(value + step);
  };
  const decrement = () => {
    if (value !== '') commitValue(value - step);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!enableDrag || disabled || value === '') return;
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartValue.current = value;
  };

  useDragListeners({
    isDragging,
    setIsDragging,
    step,
    dragStartY,
    dragStartValue,
    commitValue,
  });

  return {
    inputRef,
    value,
    isFocused,
    setIsFocused,
    handleChange,
    increment,
    decrement,
    handleMouseDown,
    decrementDisabled: disabled ?? (value === '' || (min !== undefined && value <= min)),
    incrementDisabled: disabled ?? (value === '' || (max !== undefined && value >= max)),
  };
}
