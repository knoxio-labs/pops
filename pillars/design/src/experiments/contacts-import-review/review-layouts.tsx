import { contactImportRows } from '@/fixtures/contact-imports';
import { ArrowRight } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { Candidates, Decision, Evidence, type ReviewModel } from './review-controls';

/** Batch arrangement exposes identity evidence and choices in each row. */
export function ReviewTable({ model }: { model: ReviewModel }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/6">Incoming person</TableHead>
          <TableHead className="w-1/4">Evidence</TableHead>
          <TableHead className="w-1/3">Existing candidates</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contactImportRows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-normal font-medium">{row.name}</TableCell>
            <TableCell className="whitespace-normal">
              <Evidence row={row} />
            </TableCell>
            <TableCell className="whitespace-normal">
              <Candidates row={row} model={model} />
            </TableCell>
            <TableCell className="whitespace-normal">
              <Decision row={row} model={model} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReviewQueue({ model }: { model: ReviewModel }) {
  return (
    <nav aria-label="Incoming contact queue" className="space-y-2">
      {contactImportRows.map((row) => (
        <Button
          key={row.id}
          variant={model.selected === row.id ? 'secondary' : 'ghost'}
          className="h-auto min-h-11 w-full justify-between py-3 text-left"
          onClick={() => model.select(row.id)}
        >
          <span>
            {row.name}
            <span className="block text-xs text-muted-foreground">
              {model.choices[row.id] ?? row.outcome}
            </span>
          </span>
          <ArrowRight className="size-4" />
        </Button>
      ))}
    </nav>
  );
}

function Comparison({ model }: { model: ReviewModel }) {
  const row = contactImportRows.find((item) => item.id === model.selected);
  if (!row) return null;
  return (
    <Card className="lg:col-span-2">
      <CardContent className="space-y-6 pt-6">
        <div>
          <p className="text-xs text-muted-foreground">Incoming · {row.source}</p>
          <h2 className="text-xl font-semibold">{row.name}</h2>
        </div>
        <Evidence row={row} />
        <div className="space-y-3">
          <h3 className="font-medium">Compare existing people</h3>
          <Candidates row={row} model={model} />
        </div>
        {model.candidate && (
          <p className="rounded-md bg-muted p-4 text-sm">
            Selected: {model.candidate}. Existing values are retained; incoming contact details are
            added. Conflicting field values stay unchanged for a later edit.
          </p>
        )}
        <Decision row={row} model={model} />
        <p className="text-sm text-muted-foreground">
          Choose a candidate to enable Merge, keep these people separate, or review later.
        </p>
      </CardContent>
    </Card>
  );
}

/** Focused arrangement keeps the queue visible beside one person's evidence. */
export function ReviewCompare({ model }: { model: ReviewModel }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ReviewQueue model={model} />
      <Comparison model={model} />
    </div>
  );
}
