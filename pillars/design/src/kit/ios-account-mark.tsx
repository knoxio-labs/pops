import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { initials, institutionsById } from '@/fixtures/institutions';

import type { Account } from '@/fixtures/accounts';

const MARK_SIZE = {
  sm: { box: 24, icon: 13, radius: 6, text: 9 },
  md: { box: 38, icon: 19, radius: 9, text: 13 },
  lg: { box: 54, icon: 26, radius: 13, text: 18 },
} as const;

export type MarkSize = keyof typeof MARK_SIZE;

/**
 * The same identity ladder the web chip settled on — institution logo, then
 * the institution's initials on its brand colour, then the kind icon for the
 * accounts that belong to no institution — drawn at the three sizes the phone
 * needs: a transaction row, a list row, and the account's own header.
 *
 * On a 393pt row the mark is often the only part of the identity that is not
 * truncated, so it is sized to be legible on its own rather than to decorate
 * the name beside it.
 */
export function AccountMark({ account, size = 'md' }: { account: Account; size?: MarkSize }) {
  const { box, icon, radius, text } = MARK_SIZE[size];
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)
    : undefined;
  const frame = { width: box, height: box, borderRadius: radius };
  if (institution?.logo) {
    return <img src={institution.logo} alt="" className="shrink-0 object-cover" style={frame} />;
  }
  if (institution) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center font-semibold text-white"
        style={{ ...frame, background: institution.colour, fontSize: text }}
      >
        {initials(institution.name)}
      </span>
    );
  }
  const Icon = ACCOUNT_KINDS[account.kind].icon;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{
        ...frame,
        background: 'var(--ios-surface)',
        border: '1px solid var(--ios-separator)',
        color: 'var(--ios-muted-foreground)',
      }}
    >
      <Icon size={icon} />
    </span>
  );
}
