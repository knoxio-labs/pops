import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

/** Only fixed callback outcome codes become copy; authorization query details are never rendered. */
export function ReturnNotice() {
  const { t } = useTranslation('contacts');
  const [query] = useSearchParams();
  const error = query.get('connectionError');
  if (error !== 'cancelled' && error !== 'failed') return null;
  return (
    <p role="alert" className="rounded-lg border border-border p-4 text-base leading-7">
      {t(`connections.return.${error}`)}
    </p>
  );
}
