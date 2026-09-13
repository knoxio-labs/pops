import { splitTag, type TagSourceMerchant, type TagSourceRule } from '@/fixtures/tags';
import { Pencil } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

/** A vocabulary tag as the Tags page names it: its value, with the facet ahead of it. */
export function TagName({ tag }: { tag: string }) {
  const { facet, value } = splitTag(tag);
  return (
    <span className="inline-flex items-center gap-1.5">
      {facet && <span className="text-xs text-muted-foreground">{facet}</span>}
      <Badge variant="secondary">{value}</Badge>
    </span>
  );
}

/** The rules that apply a tag, each editable where it is listed. */
export function TagRuleList({ rules }: { rules: TagSourceRule[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No rule applies this tag.</p>;
  }
  return (
    <ul className="space-y-1">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <span className="text-muted-foreground">{rule.matchType} </span>
            <span className="font-mono">{rule.pattern}</span>
          </span>
          <span className="flex items-center gap-1">
            {!rule.isActive && <Badge variant="outline">Disabled</Badge>}
            <Button variant="ghost" size="sm" aria-label={`Edit rule ${rule.pattern}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The merchants whose default tags include a tag, each editable where it is listed. */
export function TagMerchantList({ merchants }: { merchants: TagSourceMerchant[] }) {
  if (merchants.length === 0) {
    return <p className="text-sm text-muted-foreground">No merchant has it as a default tag.</p>;
  }
  return (
    <ul className="space-y-1">
      {merchants.map((merchant) => (
        <li key={merchant.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">{merchant.name}</span>
          <Button variant="ghost" size="sm" aria-label={`Edit ${merchant.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
