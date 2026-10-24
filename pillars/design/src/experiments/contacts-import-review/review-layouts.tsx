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

import { Candidates } from './candidate-controls';
import { Decision, Evidence } from './review-controls';

import type { ReviewModel } from './review-model';

/** Batch arrangement exposes identity evidence and choices in each row. */
export function ReviewTable({ model }: { model: ReviewModel }) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/6 text-sm font-semibold text-foreground">
            Incoming person
          </TableHead>
          <TableHead className="w-1/5 text-sm font-semibold text-foreground">Evidence</TableHead>
          <TableHead className="w-2/5 text-sm font-semibold text-foreground">
            Existing contacts
          </TableHead>
          <TableHead className="text-sm font-semibold text-foreground">Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contactImportRows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-normal align-top py-5 text-base font-semibold">
              {row.name}
            </TableCell>
            <TableCell className="whitespace-normal align-top py-5">
              <Evidence row={row} />
            </TableCell>
            <TableCell className="whitespace-normal align-top py-5">
              <Candidates row={row} model={model} />
            </TableCell>
            <TableCell className="whitespace-normal align-top py-5">
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
    <nav
      aria-label="Incoming contact queue"
      className="grid grid-cols-2 gap-2 lg:block lg:space-y-2"
    >
      {contactImportRows.map((row) => (
        <Button
          key={row.id}
          variant={model.selected === row.id ? 'secondary' : 'ghost'}
          className="h-auto min-h-11 w-full justify-between py-3 text-left"
          onClick={() => model.select(row.id)}
        >
          <span className="text-base font-semibold">
            {row.name}
            <span className="mt-1 block text-sm font-normal text-foreground/85">
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
          <p className="text-sm text-foreground/85">Incoming · {row.source}</p>
          <h2 className="text-2xl font-semibold">{row.name}</h2>
        </div>
        <Evidence row={row} />
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Choose who belongs in this merge</h3>
          <p className="text-base leading-7 text-foreground/90">
            Select matching contacts. Mark other people separately, or leave them for later.
          </p>
          <Candidates row={row} model={model} />
        </div>
        <Decision row={row} model={model} />
        <p className="text-sm leading-6 text-foreground/85">
          Existing details are preserved. Nothing is deleted when you exclude a candidate.
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
