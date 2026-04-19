import type { ReactNode } from 'react';

export interface ConditionalModalButtonProps {
  children: ReactNode;
  modal: ReactNode;
}

/** Documents a trigger + modal pair for controlled Radarr/rotation flows. */
export function ConditionalModalButton({ children, modal }: ConditionalModalButtonProps) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

ConditionalModalButton.displayName = 'ConditionalModalButton';
