/**
 * DocumentsSection — displays linked Paperless-ngx documents for an inventory item.
 * Shows document list with type badges and unlink buttons.
 */
import { toast } from "sonner";
import { Badge, Button, Skeleton } from "@pops/ui";
import { FileText, Unlink } from "lucide-react";
import { trpc } from "../lib/trpc";
import { LinkDocumentDialog } from "./LinkDocumentDialog";

interface DocumentsSectionProps {
  itemId: string;
}

const TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  warranty: "Warranty",
  manual: "Manual",
  other: "Other",
};

export function DocumentsSection({ itemId }: DocumentsSectionProps) {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.inventory.documents.listByItem.useQuery({
    itemId,
  });

  const unlinkMutation = trpc.inventory.documents.unlink.useMutation({
    onSuccess: () => {
      toast.success("Document unlinked");
      void utils.inventory.documents.listByItem.invalidate({ itemId });
    },
    onError: (err) => {
      toast.error(`Failed to unlink: ${err.message}`);
    },
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
        </h2>
        <LinkDocumentDialog
          itemId={itemId}
          onLinked={() => {
            void utils.inventory.documents.listByItem.invalidate({ itemId });
          }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : data?.data.length ? (
        <div className="space-y-2">
          {data.data.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-medium text-sm">
                    {doc.title ?? `Document #${doc.paperlessDocumentId}`}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ID: {doc.paperlessDocumentId}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => unlinkMutation.mutate({ id: doc.id })}
                disabled={unlinkMutation.isPending}
                title="Unlink document"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No documents linked yet.
        </p>
      )}
    </section>
  );
}
