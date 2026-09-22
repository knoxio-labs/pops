import AppCore
import DesignSystem
import SwiftUI

/// The empty search: past queries as a compact list that swipes away, and
/// what was scanned lately as small photo tiles.
internal struct InventoryRecentSearches: View {
    @Binding internal var queries: [String]
    internal let store: any InventoryStore
    internal let onSelect: (String) -> Void
    @State private var swiping: String?

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if !queries.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    PopsSectionHeader(title: "Recent")
                    InventorySelectionPanel(rows: queries.map(RecentQuery.init)) { recent in
                        row(recent.query)
                    }
                }
                .transition(.opacity)
            }
            InventoryRecentlyScanned(store: store)
        }
        .popsMotion(value: queries)
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
        .popsGroundedSwipeRow(isActive: swiping == query)
        .popsGroundedSwipeActions(
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

/// Recently scanned Inventory records, resolved from their stored identifiers through the replica.
public struct InventoryRecentlyScanned: View {
    private let store: any InventoryStore
    @AppStorage(InventorySearchRecents.scannedKey) private var storedScanned = ""
    @State private var records: [InventoryRecord] = []

    /// Creates recently scanned tiles backed by the supplied Inventory replica.
    public init(store: any InventoryStore) {
        self.store = store
    }

    public var body: some View {
        Group {
            if !records.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    PopsSectionHeader(title: "Recently scanned")
                    HStack(alignment: .top, spacing: PopsSpacing.sm) {
                        ForEach(records) { record in
                            InventoryScannedTile(
                                record: record,
                                loadPhoto: { try? await store.photo($0, variant: .thumb) })
                        }
                    }
                }
                .transition(.opacity)
            }
        }
        .task(id: storedScanned) {
            let ids = InventorySearchRecents.decode(storedScanned)
            for await result in store.observe(
                InventorySearchResults.query(text: "", includeInactive: false, scannedIDs: ids))
            {
                records = result.scanned
            }
        }
    }
}

private struct RecentQuery: Identifiable {
    let query: String
    var id: String { query }
}

/// One recently scanned thing: its photo, and its name under it.
internal struct InventoryScannedTile: View {
    internal let record: InventoryRecord
    internal let loadPhoto: @MainActor (String) async -> Data?
    @State private var image: Image?

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
    }

    internal var body: some View {
        NavigationLink(value: InventoryRoute.record(id: record.id, isContainer: record.isContainer))
        {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Color.popsSurface
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { picture }
                    .clipShape(shape)
                Text(record.name)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(record.name)
        .task(id: record.photo) {
            image = nil
            guard let photo = record.photo, let data = await loadPhoto(photo) else { return }
            image = InventoryRecordMark.decode(data)
        }
    }

    @ViewBuilder private var picture: some View {
        if let image {
            image
                .resizable()
                .scaledToFill()
        } else {
            InventorySymbol.record(access: record.access).image
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}
