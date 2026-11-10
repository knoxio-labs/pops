/** Contacts frontend entry point and remote page bundle contract. */
export { manifest } from './manifest';
export { bundles, routes } from './routes';
export { ContactPicker } from './entity/ContactPicker';

export type { ContactPickerProps } from './entity/ContactPicker';
export type { ContactReference } from './entity/api';

export { ContactChooser } from './entity/ContactChooser';
export type { ContactChooserProps } from './entity/ContactChooser';

/** Source-owned translations for host registration before rendering embedded Contacts components. */
export { i18n as contactsI18n } from './locales';

export { ContactChooserSession } from './entity/ContactChooserSession';
export type { ContactChooserSnapshot } from './entity/ContactChooserSession';

export { readContactReference } from './entity/readContactReference';
export type {
  AvailableContactReference,
  ContactReferenceRead,
} from './entity/readContactReference';
