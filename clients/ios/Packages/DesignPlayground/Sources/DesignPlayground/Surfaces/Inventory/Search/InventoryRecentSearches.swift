import DesignSystem
import SwiftUI

/// The default search screen: what was typed before, and what a scan found
/// before. Two lists rather than one merged one, because tapping either does
/// a different thing, a recent query re-runs the search, a recently scanned
/// entity opens straight to its detail.
internal struct InventoryRecentSearches: View {
    internal let queries: [String]
    internal let scanned: [InventorySearchRecord]
    internal let onSelectQuery: (String) -> Void

    internal var body: some View {
        if !queries.isEmpty {
            Section("Recent searches") {
                ForEach(queries, id: \.self) { query in
                    Button {
                        onSelectQuery(query)
                    } label: {
                        InventoryRecentQueryLabel(query: query)
                    }
                }
            }
        }
        if !scanned.isEmpty {
            Section("Recently scanned") {
                ForEach(scanned) { record in
                    InventorySearchResultRow(
                        match: InventorySearchMatch(record: record, facets: []))
                }
            }
        }
    }
}

/// One past query, as a row rather than a chip, a row is a full-width tap
/// target, and this list already sits inside one.
internal struct InventoryRecentQueryLabel: View {
    internal let query: String

    internal var body: some View {
        Label {
            Text(query).foregroundStyle(Color.popsForeground)
        } icon: {
            Image(systemName: "clock.arrow.circlepath")
                .foregroundStyle(Color.popsMutedForeground)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
        .font(.popsBody)
    }
}
