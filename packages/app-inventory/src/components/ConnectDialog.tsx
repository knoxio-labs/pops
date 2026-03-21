/**
 * ConnectDialog — Search and connect inventory items.
 *
 * Dialog with debounced search input that queries inventory items,
 * displays results, and connects on click. Prevents self-connects
 * and shows existing connections.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Badge,
} from "@pops/ui";
import { toast } from "sonner";
import { Search, Link2, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item we're connecting from */
  currentItemId: string;
  /** IDs of already-connected items (to show as disabled) */
  connectedIds: string[];
}

export function ConnectDialog({
  open,
  onOpenChange,
  currentItemId,
  connectedIds,
}: ConnectDialogProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const { data: searchResults, isLoading } = trpc.inventory.items.list.useQuery(
    { search: debouncedSearch, limit: 20 },
    { enabled: open && debouncedSearch.length >= 1 },
  );

  const connectMutation = trpc.inventory.connections.connect.useMutation({
    onSuccess: () => {
      utils.inventory.connections.listForItem.invalidate({ itemId: currentItemId });
      toast.success("Items connected");
      onOpenChange(false);
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("These items are already connected");
      } else {
        toast.error(err.message || "Failed to connect items");
      }
    },
  });

  const handleConnect = useCallback(
    (targetId: string) => {
      if (targetId === currentItemId) return;
      connectMutation.mutate({
        itemAId: currentItemId,
        itemBId: targetId,
      });
    },
    [currentItemId, connectMutation],
  );

  const connectedSet = new Set(connectedIds);
  const items = (searchResults?.data ?? []).filter((item) => item.id !== currentItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to Item</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search by name or asset ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : debouncedSearch.length < 1 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Type to search for items
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No items found
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const isConnected = connectedSet.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleConnect(item.id)}
                      disabled={isConnected || connectMutation.isPending}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">
                          {item.itemName}
                        </span>
                        {(item.brand || item.model) && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {item.brand}
                            {item.brand && item.model && " · "}
                            {item.model}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.assetId && (
                          <Badge variant="secondary" className="text-xs">
                            {item.assetId}
                          </Badge>
                        )}
                        {isConnected && (
                          <Badge variant="outline" className="text-xs">
                            Connected
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
