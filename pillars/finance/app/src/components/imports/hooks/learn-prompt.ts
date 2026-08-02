import { toast } from 'sonner';

/**
 * Offer to turn a manual fix into a correction rule.
 *
 * Every path that overrides what the matcher decided has to reach the user with
 * this offer, because the fix is otherwise local to the run: the next import of
 * the same merchant re-makes the same wrong match and the user corrects it by
 * hand again.
 */
export function promptToLearn(onAccept: () => void): void {
  toast.info('Apply this correction to future imports?', {
    description: 'This will help auto-match similar transactions next time.',
    action: { label: 'Save & Learn', onClick: onAccept },
  });
}
