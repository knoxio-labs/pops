import { useSourceState } from '../shared/useSourceEditor';
import { staySource } from './model';

import type { FailedSourceChange, SourceState } from '../shared/useSourceEditor';
import type { Stay, StayPatch } from './types';
/** Failed Stay source action retained for correction or exact retry. */
export type FailedStayChange = FailedSourceChange<StayPatch>;
/** Stay source-state cells, retaining drafts while fresh canonical reads arrive. */
export type StaySourceState = SourceState<Stay, StayPatch>;
/** Fresh Stay reads reset only an untouched editor; pending drafts survive background reads. */
export function useStaySource(initial: Stay): StaySourceState {
  return useSourceState(initial, staySource);
}
