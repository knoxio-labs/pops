import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput, cn } from '@pops/ui';

import { canvasDragType, useCanvas } from './canvas-context';

import type { CaptureKind, CaptureTarget } from './canvas-actions';

const kinds: { id: CaptureKind; label: string }[] = [
  { id: 'city', label: 'City / region' },
  { id: 'idea', label: 'Activity / idea' },
  { id: 'event', label: 'Event' },
  { id: 'stay', label: 'Accommodation' },
  { id: 'transport', label: 'Transport' },
  { id: 'rental', label: 'Car rental' },
  { id: 'section', label: 'Alternative section' },
];

/** Centred insertion target also accepts an existing card dragged from any section. */
export function CanvasInsert({
  target,
  label,
  defaultKind = 'city',
  line = true,
}: {
  target: CaptureTarget;
  label: string;
  defaultKind?: CaptureKind;
  line?: boolean;
}) {
  const canvas = useCanvas();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'group/insert relative flex items-center justify-center',
        line ? 'my-3 min-h-14' : 'min-h-11'
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(canvasDragType)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(canvasDragType);
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          canvas.move(id, target);
        }
      }}
    >
      {line && <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed" />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={label}
            title={label}
            variant="outline"
            className="relative z-10 size-11 min-h-11 min-w-11 rounded-full bg-background p-0 opacity-0 group-hover/insert:opacity-100 group-focus-within/insert:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <CaptureForm target={target} defaultKind={defaultKind} close={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CaptureForm({
  target,
  defaultKind,
  close,
}: {
  target: CaptureTarget;
  defaultKind: CaptureKind;
  close: () => void;
}) {
  const canvas = useCanvas();
  const [kind, setKind] = useState(defaultKind);
  const [name, setName] = useState('');
  function add() {
    if (!name.trim()) return;
    canvas.add(kind, name, target);
    close();
  }
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {kinds.map((item) => (
          <Button
            key={item.id}
            variant={kind === item.id ? 'secondary' : 'ghost'}
            onClick={() => setKind(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <TextInput
        autoFocus
        label={kinds.find((item) => item.id === kind)?.label}
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
      <Button disabled={!name.trim()} onClick={add}>
        Add
      </Button>
    </>
  );
}
