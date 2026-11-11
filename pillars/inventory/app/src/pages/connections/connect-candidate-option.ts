import { createElement as h } from 'react';

import { activateOptionOnKeyDown } from '../../foundation/secondary-page/option-keyboard.js';

import type { KeyboardEvent, ReactNode } from 'react';

import type { PickOption } from './connect-dialog-options.js';

/** Renders a keyboard-accessible candidate without nesting its code button in another button. */
export function optionElement(option: PickOption, pick: (key: string) => void): ReactNode {
  return h(
    'div',
    {
      key: option.key,
      tabIndex: 0,
      role: 'option',
      'aria-disabled': option.refusal !== undefined,
      onClick: () => option.refusal === undefined && pick(option.key),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) =>
        activateOptionOnKeyDown(event, option.refusal !== undefined, () => pick(option.key)),
    },
    option.mark,
    `${option.title} ${option.refusal ?? ''}`,
    option.meta
  );
}
