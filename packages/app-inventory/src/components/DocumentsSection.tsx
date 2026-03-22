/**
 * DocumentsSection — displays linked Paperless-ngx documents for an inventory item.
 * Shows document list grouped by type with unlink buttons.
 */
import { toast } from "sonner";
import { Button, Skeleton } from "@pops/ui";
import { FileText, ExternalLink, Download, Trash2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { LinkDocumentDialog } from "./LinkDocumentDialog";

interface DocumentsSectionProps {
  itemId: string;
}

const DOC_TYPE_GROUPS = [
  { key: "receipt", label: "Receipts" },
  { key: "warranty", label: "Warranties" },
  { key: "manual", label: "Manuals" },
  { key: "other", label: "Other" },
] as const;

export function DocumentsSection({ itemId }: DocumentsSectionProps) {
  const utils = trpc.useUtils();

  const { data: configData, isLoading: configLoading } =
    trpc.inventory.documents.config.useQuery();

  const { data: documentsData, isLoading: documentsLoading } =
    trpc.inventory.documents.listByItem.useQuery(
      { itemId },
      { enabled: !!configData?.isConfigured },
    );

  const unlinkMutation = trpc.inventory.documents.unlink.useMutation({
    onSuccess: () => {
      toast.success("Document unlinked");
      void utils.inventory.documents.listByItem.invalidate({ itemId });
    },
    onError: (err) => {
      toast.error(`Failed to unlink: ${err.message}`);
    },
  });

  if (configLoading) {
    return (
      <section className="mt-8 space-y-2">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  if (!configData?.isConfigured) {
    return null; // PRD R6: hide section if Paperless is not configured
  }

  const baseUrl = configData.baseUrl;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Linked Documents
          {documentsData?.data.length ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({documentsData.data.length})
            </span>
          ) : null}
        </h2>
        <LinkDocumentDialog
          itemId={itemId}
          onLinked={() => {
            void utils.inventory.documents.listByItem.invalidate({ itemId });
          }}
        />
      </div>

      {documentsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !documentsData?.data.length ? (
        <p className="text-muted-foreground text-sm">
          No linked documents yet.
        </p>
      ) : (
        <div className="space-y-6">
          {DOC_TYPE_GROUPS.map(({ key, label }) => {
            const docs = documentsData.data.filter(
              (d) => d.documentType === key,
            );
            if (docs.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {label}
                </h3>
                <div className="space-y-2">
                  {docs.map((doc) => {
                    const paperlessUrl = `${baseUrl}/documents/${doc.paperlessDocumentId}/details`;
                    const downloadUrl = `/api/paperless/documents/${doc.paperlessDocumentId}/download`;
                    const thumbnailUrl = `/api/paperless/documents/${doc.paperlessDocumentId}/thumb`;
                    const isUnlinking =
                      unlinkMutation.isPending &&
                      unlinkMutation.variables?.id === doc.id;

                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                      >
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="h-12 w-12 rounded object-cover shrink-0 bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">
                            {doc.title ??
                              `Document #${doc.paperlessDocumentId}`}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Linked {new Date(doc.linkedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={paperlessUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Paperless-ngx"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                          <a href={downloadUrl} download title="Download">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              unlinkMutation.mutate({ id: doc.id })
                            }
                            disabled={isUnlinking}
                            title="Unlink document"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
