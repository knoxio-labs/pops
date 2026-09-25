/**
 * The right-anchored side panel @pops/ui does not have (spec 4.3): 480px,
 * focus-trapped, Esc closes, never navigates. Store here, bulk field edit,
 * repair cases, event detail and the tablet preview all open in it. Only
 * the body scrolls; the header and the footer's actions stay put.
 */
import { X } from 'lucide-react';

import {
  ButtonPrimitive,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
} from '@pops/ui';

import type { ReactNode } from 'react';

/** What a sheet shows: a title, one line on what it is for, a body and its actions. */
export interface SheetContentProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** The actions row; the primary action goes last. */
  footer?: ReactNode;
}

function Header({
  title,
  description,
  onClose,
  asDialog,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
  asDialog: boolean;
}) {
  const Title = asDialog ? DialogTitle : 'h2';
  const Description = asDialog ? DialogDescription : 'p';
  return (
    <header className="flex items-start gap-3 border-b px-5 py-4">
      <div className="min-w-0 flex-1">
        <Title className="text-base font-semibold leading-tight">{title}</Title>
        {description ? (
          <Description className="mt-1 text-sm text-muted-foreground">{description}</Description>
        ) : null}
      </div>
      <ButtonPrimitive
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={onClose}
        className="-mt-1 -mr-2 shrink-0"
      >
        <X className="size-4" aria-hidden />
      </ButtonPrimitive>
    </header>
  );
}

function Layout({
  content,
  onClose,
  asDialog,
}: {
  content: SheetContentProps;
  onClose?: () => void;
  asDialog: boolean;
}) {
  return (
    <>
      <Header
        title={content.title}
        description={content.description}
        onClose={onClose}
        asDialog={asDialog}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{content.children}</div>
      {content.footer ? (
        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
          {content.footer}
        </footer>
      ) : null}
    </>
  );
}

/** Props for {@link Sheet}. */
export interface SheetProps extends SheetContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The sheet as a modal side panel over the page. */
export function Sheet({ open, onOpenChange, ...content }: SheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 md:inset-y-0 md:right-0 md:left-auto md:top-0 md:h-full md:w-120 md:max-w-full md:translate-x-0 md:translate-y-0 md:rounded-none md:rounded-l-xl md:data-[state=open]:zoom-in-100 md:data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-right"
      >
        <Layout content={content} onClose={() => onOpenChange(false)} asDialog />
      </DialogContent>
    </Dialog>
  );
}

/** The same sheet drawn in place, for the gallery and for review states. */
export function SheetPanel({
  onClose,
  className,
  ...content
}: SheetContentProps & { onClose?: () => void; className?: string }) {
  return (
    <section
      aria-label={content.title}
      className={cn(
        'flex h-full w-120 max-w-full flex-col rounded-l-xl border bg-background shadow-lg',
        className
      )}
    >
      <Layout content={content} onClose={onClose} asDialog={false} />
    </section>
  );
}
