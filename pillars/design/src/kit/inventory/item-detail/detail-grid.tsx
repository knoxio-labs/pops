import { Badge, type Condition, ConditionBadge, TypeBadge, WarrantyBadge } from '@pops/ui';

import type { ReactNode } from 'react';

import type { DetailHeaderItem } from './detail-header-item';

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
        {label}
      </dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function StatusBadge({ inUse }: { inUse: boolean }) {
  if (inUse) {
    return (
      <Badge className="bg-app-accent/10 text-app-accent border-app-accent/20 hover:bg-app-accent/15">
        In Use
      </Badge>
    );
  }
  return <Badge variant="secondary">Stored</Badge>;
}

export function DetailGrid({ item }: { item: DetailHeaderItem }) {
  return (
    <div className="bg-card border-2 border-app-accent/10 rounded-2xl overflow-hidden mb-8 shadow-sm shadow-app-accent/5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6">
        {item.type && <DetailField label="Type" value={<TypeBadge type={item.type} />} />}
        {item.condition && (
          <DetailField
            label="Condition"
            value={<ConditionBadge condition={item.condition as Condition} />}
          />
        )}
        <DetailField
          label="Warranty"
          value={<WarrantyBadge warrantyExpiry={item.warrantyExpires ?? null} />}
        />
        {item.room && <DetailField label="Room" value={item.room} />}
        {item.assetId && (
          <DetailField
            label="Asset ID"
            value={
              <Badge variant="outline" className="font-mono bg-muted/50">
                {item.assetId}
              </Badge>
            }
          />
        )}
        <DetailField label="Status" value={<StatusBadge inUse={item.inUse} />} />
        {item.purchaseDate && (
          <DetailField
            label="Purchased"
            value={new Date(item.purchaseDate).toLocaleDateString('en-AU', {
              year: 'numeric',
              month: 'short',
            })}
          />
        )}
        {item.replacementValue !== null && item.replacementValue !== undefined && (
          <DetailField
            label="Replacement"
            value={
              <span className="text-app-accent font-bold">{`$${item.replacementValue.toLocaleString()}`}</span>
            }
          />
        )}
      </div>
    </div>
  );
}
