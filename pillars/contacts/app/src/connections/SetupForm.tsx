import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, CheckboxInput, DialogFooter, TextInput } from '@pops/ui';

import type { ContactConnection, ContactProvider, IcloudCredentials } from './contracts';

/** Setup collects credentials only after an explicit user action; Other contacts is opt-in. */
export function SetupForm({
  provider,
  account,
  pending,
  onGoogle,
  onIcloud,
  onCancel,
}: {
  provider: ContactProvider;
  account?: ContactConnection;
  pending: boolean;
  onGoogle: (includeOtherContacts: boolean) => void;
  onIcloud: (credentials: IcloudCredentials) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('contacts');
  const [otherContacts, setOtherContacts] = useState(account?.includeOtherContacts ?? false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (provider === 'google') onGoogle(otherContacts);
        else {
          onIcloud({ accountId: account?.accountId, username: username.trim(), password });
          setPassword('');
        }
      }}
    >
      {account?.reauthorizationRequired && <p role="status">{t('connections.messages.expired')}</p>}
      {provider === 'google' ? (
        <GoogleOptions checked={otherContacts} disabled={pending} onChange={setOtherContacts} />
      ) : (
        <IcloudFields
          username={username}
          password={password}
          disabled={pending}
          onUsername={setUsername}
          onPassword={setPassword}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          {t('connections.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {t(provider === 'google' ? 'connections.continueGoogle' : 'connections.connectIcloud')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function GoogleOptions({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border bg-muted/30 p-5 text-base leading-7">
        {t('connections.googleHint')}
      </p>
      <CheckboxInput
        label={
          <span className="inline-flex min-h-11 items-center">
            {t('connections.otherContacts')}
          </span>
        }
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <p className="text-sm leading-6 text-foreground/85">{t('connections.otherContactsHint')}</p>
    </div>
  );
}

function IcloudFields({
  username,
  password,
  disabled,
  onUsername,
  onPassword,
}: {
  username: string;
  password: string;
  disabled: boolean;
  onUsername: (value: string) => void;
  onPassword: (value: string) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <TextInput
        label={t('connections.appleEmail')}
        type="email"
        autoComplete="username"
        required
        disabled={disabled}
        value={username}
        onChange={(event) => onUsername(event.target.value)}
      />
      <TextInput
        label={t('connections.password')}
        type="password"
        autoComplete="off"
        required
        disabled={disabled}
        value={password}
        onChange={(event) => onPassword(event.target.value)}
      />
      <p className="text-sm leading-6 text-foreground/85">{t('connections.passwordHint')}</p>
    </>
  );
}
