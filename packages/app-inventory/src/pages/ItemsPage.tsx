/**
 * Inventory items list page with dashboard summary widgets.
 */
import { Card, CardContent, Skeleton } from "@pops/ui";
import { Package, DollarSign, Shield, Clock } from "lucide-react";
import { trpc } from "../lib/trpc";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function DashboardWidgets() {
  const { data, isLoading } = trpc.inventory.reports.dashboard.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data?.data) return null;

  const { itemCount, totalReplacementValue, totalResaleValue, warrantiesExpiringSoon, recentlyAdded } = data.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium">Items</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">{itemCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Replacement</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalReplacementValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Resale</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalResaleValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">Warranties</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {warrantiesExpiringSoon}
              <span className="text-sm font-normal text-muted-foreground ml-1">expiring</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {recentlyAdded.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Recently Added</span>
            </div>
            <ul className="space-y-2">
              {recentlyAdded.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{item.itemName}</span>
                  {item.type && (
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {item.type}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ItemsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
      <DashboardWidgets />
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <Package className="h-12 w-12" />
        <p>Item list coming soon.</p>
      </div>
    </div>
  );
}
