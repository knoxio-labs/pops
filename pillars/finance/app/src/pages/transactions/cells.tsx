import { SignedAmount } from '../../components/SignedAmount';

export function AmountCell({ amount }: { amount: number }) {
  return (
    <div className="text-right font-mono font-medium tabular-nums">
      <SignedAmount amount={amount} />
    </div>
  );
}

export function DescriptionCell({
  description,
  entityName,
}: {
  description: string;
  entityName?: string | null;
}) {
  return (
    <div className="max-w-md">
      <div className="font-medium truncate">{description}</div>
      {entityName && <div className="text-sm text-muted-foreground truncate">{entityName}</div>}
    </div>
  );
}
