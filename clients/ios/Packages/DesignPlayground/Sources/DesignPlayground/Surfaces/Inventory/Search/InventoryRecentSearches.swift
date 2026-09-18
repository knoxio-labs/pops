import DesignSystem
import SwiftUI

/// The empty search: past queries as a compact list that swipes away, and
/// what was scanned lately as small photo tiles.
internal struct InventoryRecentSearches: View {
    @Binding internal var queries: [String]
    internal let scanned: [InventorySearchRecord]
    internal let onSelect: (String) -> Void
    @State private var swiping: String?

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if !queries.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(title: "Recent")
                    InventoryLocationPanel(rows: queries.map(RecentQuery.init)) { recent in
                        row(recent.query)
                    }
                }
                .transition(.opacity)
            }
            if !scanned.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(title: "Recently scanned")
                    HStack(alignment: .top, spacing: PopsSpacing.sm) {
                        ForEach(scanned) { InventoryScannedTile(record: $0) }
                    }
                }
            }
        }
        .inventoryMotion(value: queries)
    }

    private func row(_ query: String) -> some View {
        Button {
            onSelect(query)
        } label: {
            HStack(spacing: PopsSpacing.md) {
                InventorySymbol.activity.image
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(query)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
            }
            .padding(.vertical, PopsSpacing.sm)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .inventoryGroundedSwipeRow(isActive: swiping == query)
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { swiping = $0 ? query : nil },
            actions: {
                Button(role: .destructive) {
                    queries.removeAll { $0 == query }
                } label: {
                    Label("Remove", systemImage: InventorySymbol.discard.system)
                }
            })
    }
}

private struct RecentQuery: Identifiable {
    let query: String
    var id: String { query }
}

/// One recently scanned thing: its photo, and its name under it.
internal struct InventoryScannedTile: View {
    internal let record: InventorySearchRecord

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
    }

    internal var body: some View {
        NavigationLink(value: InventoryRoute.record(record)) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Color.popsSurface
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        InventoryItemDetailPicture(
                            photo: record.photo.map {
                                InventoryPhoto(caption: "", isBroken: false, imageData: $0)
                            },
                            symbol: record.item.symbol.system)
                    }
                    .clipShape(shape)
                Text(record.item.name)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(record.item.name)
    }
}
