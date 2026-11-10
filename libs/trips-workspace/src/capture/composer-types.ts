import type { CaptureBrowserSession } from './browser-session';
import type { CaptureEditorState } from './editor-types';
import type { CaptureWorkspaceProps } from './types';
import type { CaptureContext } from './use-capture-context';

/** Props shared by the text-first composer and its optional detail controls. */
export interface CaptureComposerProps extends CaptureWorkspaceProps {
  session: CaptureBrowserSession;
  state: CaptureEditorState;
  context: CaptureContext;
}
