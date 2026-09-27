import { useCallback } from 'react';

import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { useInHandPageCommands } from './in-hand-page-commands.js';

import type { Dispatch, ReactElement, SetStateAction } from 'react';

import type { PlacementTarget } from '../../foundation/model/model.js';
import type { InHandPageCommands } from './in-hand-page-commands.js';
import type { InHandPageData } from './in-hand-page-types.js';

/** The mutation and picker commands exposed to the in-hand view. */
export interface InHandPageActions extends InHandPageCommands {
  readonly openPicker: (ids: readonly string[], anchor: 'row' | 'dock') => void;
  readonly onPutBack: (id: string) => void;
  readonly onMove: (id: string) => void;
  readonly picker: ReactElement | null;
  readonly pickerIds: readonly string[];
  readonly pickerAnchor: 'row' | 'dock' | null;
}

interface PickerState {
  readonly pickerIds: readonly string[];
  readonly pickerAnchor: 'row' | 'dock' | null;
  readonly setPickerIds: Dispatch<SetStateAction<readonly string[]>>;
  readonly setPickerAnchor: Dispatch<SetStateAction<'row' | 'dock' | null>>;
}

function Picker({
  data,
  state,
  onPick,
  onClose,
  onCreatePlace,
}: {
  data: InHandPageData;
  state: PickerState;
  onPick: (target: PlacementTarget) => void;
  onClose: () => void;
  onCreatePlace: (name: string, parentId: string | null) => void;
}): ReactElement | null {
  if (state.pickerIds.length === 0) return null;
  const pickerClass =
    state.pickerAnchor === 'dock'
      ? 'absolute top-1 left-1 size-px'
      : 'absolute top-full right-2 size-px';
  return (
    <PlacementPicker
      world={data.placement.world}
      subject={{ kind: 'items', ids: state.pickerIds }}
      recents={data.placement.recents}
      onPick={onPick}
      onCreatePlace={data.online ? onCreatePlace : undefined}
      trigger={<span aria-hidden className={pickerClass} />}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

/** Binds the page commands to the row and selection-picker affordances. */
export function useInHandPageActions(
  data: InHandPageData,
  pickerState: PickerState
): InHandPageActions {
  const commands = useInHandPageCommands(data);
  const { pickerIds, pickerAnchor, setPickerIds, setPickerAnchor } = pickerState;
  const clearPicker = useCallback((): void => {
    setPickerIds([]);
    setPickerAnchor(null);
  }, [setPickerAnchor, setPickerIds]);
  const openPicker = useCallback(
    (ids: readonly string[], anchor: 'row' | 'dock'): void => {
      setPickerIds([...ids]);
      setPickerAnchor(anchor);
    },
    [setPickerAnchor, setPickerIds]
  );
  const onPick = useCallback(
    (target: PlacementTarget): void => {
      const ids = pickerIds;
      clearPicker();
      commands.move(ids, target);
    },
    [clearPicker, commands, pickerIds]
  );
  const onMove = useCallback(
    (id: string): void => {
      data.rejections.clear([id]);
      openPicker([id], 'row');
    },
    [data.rejections, openPicker]
  );
  const onCreatePlace = useCallback(
    (name: string, parentId: string | null): void => {
      void data.placement.createLocation.mutateAsync({ name, parentId });
    },
    [data.placement.createLocation]
  );
  const picker = (
    <Picker
      data={data}
      state={pickerState}
      onPick={onPick}
      onClose={clearPicker}
      onCreatePlace={onCreatePlace}
    />
  );
  return {
    ...commands,
    openPicker,
    onPutBack: commands.putBack,
    onMove,
    picker,
    pickerIds,
    pickerAnchor,
  };
}
