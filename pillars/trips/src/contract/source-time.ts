import { z } from 'zod';

/** A supplied supported IANA zone; numeric offsets are not zone identities. */
export const SourceTimeZoneSchema = z.string().refine((value) => {
  if (!value || /^[+-]/u.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, 'Expected a supported IANA time zone');
