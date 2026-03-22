/**
 * LinkDocumentDialog — link a Paperless-ngx document to an inventory item.
 * Provides manual entry of document ID and type selection.
 * Will integrate with Paperless search when tb-135 API client is available.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  TextInput,
  Select,
} from "@pops/ui";
import { FileText } from "lucide-react";
import { trpc } from "../lib/trpc";

const DOCUMENT_TYPES = [
  { value: "receipt", label: "Receipt" },
  { value: "warranty", label: "Warranty" },
  { value: "manual", label: "Manual" },
  { value: "invoice", label: "Invoice" },
  { value: "other", label: "Other" },
];

interface LinkDocumentDialogProps {
  itemId: string;
  onLinked: () => void;
}

export function LinkDocumentDialog({
  itemId,
  onLinked,
}: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [documentType, setDocumentType] = useState<string>("receipt");
  const [title, setTitle] = useState("");

  const linkMutation = trpc.inventory.documents.link.useMutation({
    onSuccess: () => {
      toast.success("Document linked");
      onLinked();
      setOpen(false);
      resetForm();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("This document is already linked to this item");
      } else {
        toast.error(`Failed to link: ${err.message}`);
      }
    },
  });

  const resetForm = () => {
    setDocumentId("");
    setDocumentType("receipt");
    setTitle("");
  };

  const handleLink = () => {
    const parsedId = parseInt(documentId, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      toast.error("Please enter a valid document ID");
      return;
    }

    linkMutation.mutate({
      itemId,
      paperlessDocumentId: parsedId,
      documentType: documentType as
        | "receipt"
        | "warranty"
        | "manual"
        | "invoice"
        | "other",
      title: title || null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-1.5" />
          Link Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Document</DialogTitle>
          <DialogDescription>
            Link a Paperless-ngx document to this item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Paperless Document ID *
            </label>
            <TextInput
              type="number"
              min="1"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              placeholder="e.g. 42"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Document Type *
            </label>
            <Select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              options={DOCUMENT_TYPES}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Title (optional)
            </label>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Purchase receipt"
            />
          </div>

          <Button
            onClick={handleLink}
            loading={linkMutation.isPending}
            loadingText="Linking..."
            className="w-full"
          >
            Link Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
