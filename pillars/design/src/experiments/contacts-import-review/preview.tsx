import { contactImportRows } from '@/fixtures/contact-imports';
import { FileUp } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, CardContent, PageHeader } from '@pops/ui';

import type { ScreenStates } from '@/contract';

type Condition = 'ready' | 'loading' | 'error' | 'empty' | 'success';
const messages = {
  loading: 'Reading records and preparing identity evidence…',
  error:
    'Could not read contacts.vcf. The file is incomplete. Choose another file; nothing has been imported.',
  empty: 'No contact records found. Choose another source.',
  success: 'Preview ready. Nothing has been written.',
};

function SourceSelection({ source, select }: { source: string; select: (source: string) => void }) {
  const isFile = source === 'vCard' || source === 'CSV';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {['vCard', 'CSV', 'Google', 'iCloud'].map((name) => (
          <Button
            key={name}
            variant={source === name ? 'default' : 'outline'}
            onClick={() => select(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <FileUp className="size-6 text-muted-foreground" />
          <h2 className="font-semibold">
            {isFile ? 'Choose a contact file' : `Select your ${source} connection`}
          </h2>
          {isFile ? (
            <label className="block space-y-2 text-sm">
              <span>Contact file</span>
              <input
                type="file"
                accept={source === 'CSV' ? '.csv' : '.vcf'}
                className="block min-h-11 w-full rounded-md border border-input p-2"
              />
            </label>
          ) : (
            <p className="text-sm">Sample account · owner@example.test · read contacts only</p>
          )}
          <p className="text-sm text-muted-foreground">
            CSV needs a name, email or phone column. Original values and source labels are
            preserved.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function PreviewRecords() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="font-semibold">contacts.vcf · preview</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">6 records</Badge>
          <Badge variant="outline">3 automatic merges</Badge>
          <Badge variant="outline">2 decisions</Badge>
          <Badge variant="outline">1 new person</Badge>
        </div>
        <ul className="divide-y divide-border">
          {contactImportRows.map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span>{row.name}</span>
              <span className="text-sm text-muted-foreground">{row.evidence}</span>
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            window.location.href = '/design/s/contacts/import-review';
          }}
        >
          Review identities
        </Button>
      </CardContent>
    </Card>
  );
}

/** Preview preserves the same identity evidence across files and provider sources. */
export function ImportPreview({ condition = 'ready' }: { condition?: Condition }) {
  const [source, setSource] = useState('vCard');
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Import contacts"
        description="Preview first. You decide what becomes a person in POPS."
      />
      <SourceSelection source={source} select={setSource} />
      {condition === 'ready' ? (
        <PreviewRecords />
      ) : (
        <p role={condition === 'error' ? 'alert' : 'status'}>{messages[condition]}</p>
      )}
    </div>
  );
}
/** Preview boundaries never imply a successful write. */
export const previewStates: ScreenStates = {
  loading: () => <ImportPreview condition="loading" />,
  error: () => <ImportPreview condition="error" />,
  empty: () => <ImportPreview condition="empty" />,
  success: () => <ImportPreview condition="success" />,
};
