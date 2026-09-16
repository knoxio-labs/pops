import DesignSystem
import SwiftUI

/// What search and browse say about the sync state they are reading through,
/// shared so the words are the same everywhere they appear. "Offline lookup
/// is visibly useful" (the ticket's done-when) means this is never blank
/// when there is something to disclose.
internal struct InventorySearchSyncBanner: View {
    internal let syncState: InventorySyncState

    @ViewBuilder internal var body: some View {
        if let message {
            Section {
                Text(message)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var message: String? {
        switch syncState {
        case .current: nil
        case .offline(let updated): "Offline. Showing results as of \(updated)."
        case .synchronizing(let progress):
            "Catching up with the server, \(progress) complete. Results include what has synced so far."
        case .needsAttention(let count):
            "\(count) \(count == 1 ? "change" : "changes") need attention and may not be reflected yet."
        }
    }
}

/// Opens the filter/sort sheet, and says at a glance whether anything is
/// filtered.
internal struct InventorySearchFilterButton: View {
    internal let hasActiveFilters: Bool
    internal let action: () -> Void

    internal var body: some View {
        Button(action: action) {
            Image(
                systemName: hasActiveFilters
                    ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle"
            )
        }
        .accessibilityLabel("Filter and sort")
    }
}

/// A catalogue's own results, filtered to nothing: the query matched
/// something (or the browser has records), and the active filters removed
/// every one of them. Distinct from no results at all, because the fix is
/// different, clear a filter, not try another word.
internal struct InventoryFilteredEmptyView: View {
    internal let matchCount: Int
    internal let query: String?
    internal let onClear: () -> Void

    internal var body: some View {
        VStack(spacing: PopsSpacing.md) {
            ContentUnavailableView(
                "No results with these filters",
                systemImage: "line.3.horizontal.decrease.circle",
                description: Text(description))
            Button("Clear filters", action: onClear)
                .playgroundGlassButton()
                .tint(.popsInventory)
        }
    }

    private var description: String {
        guard let query else { return "\(matchCount) in the catalogue without them." }
        return "\(matchCount) match \"\(query)\" without them."
    }
}
