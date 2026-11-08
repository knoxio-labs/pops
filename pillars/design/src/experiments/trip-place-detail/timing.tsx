import { CalendarDays } from 'lucide-react';

import {
  Button,
  ComboboxSelect,
  TextInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

import { useIdea } from './context';
import { timingModes } from './fixture';
import { ideaTimingLabel } from './model';

/** Optional month or date bounds remain source fields; switching precision retains inactive values. */
export function IdeaTiming() {
  const { state } = useIdea();
  return (
    <section aria-label="Idea timing">
      <h2 className="text-xs font-medium text-muted-foreground">When</h2>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="Edit timing">
            <CalendarDays className="size-4 text-app-accent" aria-hidden />
            {ideaTimingLabel(state) || 'Add timing'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <TimingFields />
        </PopoverContent>
      </Popover>
    </section>
  );
}

function TimingFields() {
  const { state, change } = useIdea();
  const { timing } = state;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ComboboxSelect
          aria-label="Timing precision"
          value={timing.mode}
          options={timingModes}
          variant="ghost"
          onChange={(value) => {
            const mode = timingModes.find((item) => item.value === value);
            if (mode && mode.value !== timing.mode)
              change({ ...state, timing: { ...timing, mode: mode.value } });
          }}
        />
      </div>
      {timing.mode === 'month' && (
        <div className="w-52">
          <TextInput
            type="month"
            aria-label="Month"
            key={timing.month}
            defaultValue={timing.month}
            onBlur={(event) => {
              if (event.currentTarget.value !== timing.month)
                change({ ...state, timing: { ...timing, month: event.currentTarget.value } });
            }}
          />
        </div>
      )}
      {timing.mode === 'dates' && (
        <div className="flex flex-wrap gap-3">
          {(['from', 'to'] as const).map((field) => (
            <div key={field} className="w-48">
              <TextInput
                type="date"
                label={field === 'from' ? 'From' : 'To'}
                key={timing[field]}
                defaultValue={timing[field]}
                onBlur={(event) => {
                  if (event.currentTarget.value !== timing[field])
                    change({ ...state, timing: { ...timing, [field]: event.currentTarget.value } });
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
