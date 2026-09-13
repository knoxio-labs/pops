/**
 * Shared stand-in for the server round trips `useItemFormPageModel`'s hooks
 * make. The canvas has no server, so every save/upload/delete just waits out
 * a fixed delay where the source shows a spinner for a network request.
 */
export const SIMULATED_SAVE_MS = 500;
export const SIMULATED_UPLOAD_MS = 450;
export const SIMULATED_DELETE_MS = 350;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
