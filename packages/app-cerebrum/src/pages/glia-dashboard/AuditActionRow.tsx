import { useTranslation } from 'react-i18next';

import { Badge, TableCell, TableRow, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import { type GliaAction, type GliaActionStatus } from '../../glia/types';
import { formatTimestamp } from '../../utils/format';

function statusVariant(
  status: GliaActionStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'executed':
    case 'approved':
      return 'default';
    case 'rejected':
    case 'reverted':
      return 'destructive';
    case 'pending':
    default:
      return 'secondary';
  }
}

function AffectedIdsCell({ ids }: { ids: readonly string[] }) {
  const { t } = useTranslation('cerebrum');
  const visible = ids.slice(0, 3).join(', ');
  const overflow = ids.length - 3;
  if (overflow <= 0) {
    return <TableCell className="text-xs">{visible}</TableCell>;
  }
  return (
    <TableCell className="text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="cursor-help underline decoration-dotted"
            data-testid="glia-audit-affected-more"
          >
            {visible}
            {t('glia.audit.affectedMore', { count: overflow })}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="break-all">{ids.join(', ')}</span>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

export function AuditActionRow({ action }: { action: GliaAction }) {
  return (
    <TableRow data-testid="glia-audit-row">
      <TableCell className="text-xs">{formatTimestamp(action.createdAt)}</TableCell>
      <TableCell className="text-xs">
        <Badge variant="outline">{action.actionType}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(action.status)}>{action.status}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{action.phase}</TableCell>
      <AffectedIdsCell ids={action.affectedIds} />
      <TableCell className="text-xs">{action.rationale}</TableCell>
    </TableRow>
  );
}
