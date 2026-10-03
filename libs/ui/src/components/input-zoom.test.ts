import { describe, expect, it } from 'vitest';

import {
  containerVariants as chipInputContainerVariants,
  inputVariants as chipInputVariants,
} from './ChipInput.variants';
import {
  containerVariants as numberInputContainerVariants,
  inputVariants as numberInputVariants,
} from './NumberInput.variants';
import { containerVariants as selectContainerVariants, selectVariants } from './Select.variants';
import {
  containerVariants as textInputContainerVariants,
  inputVariants as textInputVariants,
} from './TextInput.variants';

type InputSize = 'sm' | 'default' | 'lg';

const inputs = [
  {
    name: 'TextInput',
    classes: (size: InputSize) =>
      [textInputContainerVariants({ size }), textInputVariants({ size })].join(' '),
  },
  {
    name: 'Select',
    classes: (size: InputSize) =>
      [selectContainerVariants({ size }), selectVariants({ size })].join(' '),
  },
  {
    name: 'NumberInput',
    classes: (size: InputSize) =>
      [numberInputContainerVariants({ size }), numberInputVariants({ size })].join(' '),
  },
  {
    name: 'ChipInput',
    classes: (size: InputSize) =>
      [chipInputContainerVariants(), chipInputVariants({ size })].join(' '),
  },
];

describe.each(inputs)('$name touch typography', ({ classes }) => {
  it.each([
    ['sm', 'md:text-xs'],
    ['default', 'md:text-sm'],
    ['lg', null],
  ] satisfies [InputSize, string | null][])(
    'keeps the %s input at 16px before desktop sizing',
    (size, desktopClass) => {
      const classNames = classes(size).split(' ');
      expect(classNames).toContain('text-base');
      if (desktopClass) expect(classNames).toContain(desktopClass);
    }
  );
});
