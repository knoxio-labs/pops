import { z } from 'zod';

/** A minute-precision source clock without a date, offset or inferred time zone. */
export const SourceClockSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, 'Expected an HH:mm local clock');

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
