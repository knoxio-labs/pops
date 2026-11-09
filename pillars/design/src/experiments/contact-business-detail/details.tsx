import { CopyContact } from '../contact-person-detail/copy-contact';
import { useBusiness } from './context';
import { BusinessEditor } from './editor';
import {
  removeBusinessMethod,
  removeBusinessWebsite,
  saveBusinessMethod,
  saveBusinessWebsite,
  isBusinessWebsiteUrl,
} from './model';

import type { BusinessState } from './model';

const methodFields = [
  { key: 'label', label: 'Label' },
  { key: 'value', label: 'Value' },
];
const websiteFields = [
  { key: 'label', label: 'Label' },
  { key: 'url', label: 'Website URL' },
];

/** Shows global methods and websites with explicit per-record editing. */
export function BusinessDetails() {
  const { state } = useBusiness();
  return (
    <section aria-label="Global contact details" className="space-y-3">
      <h2 className="text-base font-semibold leading-6 tracking-normal">Contact details</h2>
      <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/15 bg-card px-4">
        {state.business.methods.map((method) => (
          <div key={method.id} className="flex items-center gap-1 py-2">
            <div className="min-w-0 flex-1 py-1">
              <p className="text-xs text-muted-foreground">{method.label || 'Contact method'}</p>
              <p className="break-words">{method.value}</p>
            </div>
            <CopyContact value={method.value} label={`Copy ${method.label || 'contact method'}`} />
            <MethodEditor method={method} />
          </div>
        ))}
        <div className="py-1">
          <MethodEditor method={{ id: '', label: '', value: '' }} add />
        </div>
      </div>
      <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/15 bg-card px-4">
        {state.websites.map((website) => (
          <div key={website.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1 py-1">
              <p className="text-xs text-muted-foreground">{website.label || 'Website'}</p>
              {isBusinessWebsiteUrl(website.url) ? (
                <a
                  className="inline-flex min-h-11 items-center break-all text-app-accent underline underline-offset-4"
                  href={website.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {website.url}
                </a>
              ) : (
                <>
                  <p className="break-all">{website.url}</p>
                  <p className="text-sm text-muted-foreground">
                    Website address unavailable for opening
                  </p>
                </>
              )}
            </div>
            <WebsiteEditor website={website} />
          </div>
        ))}
        <div className="py-1">
          <WebsiteEditor website={{ id: '', label: '', url: '' }} add />
        </div>
      </div>
    </section>
  );
}

function MethodEditor({
  method,
  add = false,
}: {
  method: BusinessState['business']['methods'][number];
  add?: boolean;
}) {
  const { state, change } = useBusiness();
  return (
    <BusinessEditor
      label={add ? 'Add contact method' : `Edit ${method.label || 'contact method'}`}
      add={add}
      values={method}
      validationMessage="Enter a contact value."
      fields={methodFields}
      save={(draft) => {
        const next = saveBusinessMethod(state, {
          id: add ? crypto.randomUUID() : method.id,
          label: draft.label ?? '',
          value: draft.value ?? '',
        });
        change(next);
        return next !== state;
      }}
      remove={add ? undefined : () => change(removeBusinessMethod(state, method.id))}
    />
  );
}
function WebsiteEditor({
  website,
  add = false,
}: {
  website: BusinessState['websites'][number];
  add?: boolean;
}) {
  const { state, change } = useBusiness();
  return (
    <BusinessEditor
      label={add ? 'Add website' : `Edit ${website.label || 'website'}`}
      add={add}
      values={website}
      validationMessage="Use a complete HTTP or HTTPS URL."
      fields={websiteFields}
      save={(draft) => {
        const next = saveBusinessWebsite(state, {
          id: add ? crypto.randomUUID() : website.id,
          label: draft.label ?? '',
          url: draft.url ?? '',
        });
        change(next);
        return next !== state;
      }}
      remove={add ? undefined : () => change(removeBusinessWebsite(state, website.id))}
    />
  );
}
