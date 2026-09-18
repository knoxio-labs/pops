import DesignSystem
import SwiftUI

/// Merchant, price, receipt and warranty. Absent entirely when nothing is
/// recorded: a section that exists to say "not recorded" is a section a sparse
/// item's page is made of.
internal struct InventoryItemDetailProvenanceSection: View {
    internal let provenance: InventoryProvenance?

    @ViewBuilder internal var body: some View {
        if let provenance {
            InventoryItemDetailGroup("Provenance") {
                InventoryPropertyLine(key: "Merchant", value: provenance.merchant)
                InventoryPropertyLine(key: "Price", value: provenance.price)
                InventoryPropertyLine(key: "Purchased", value: provenance.purchasedOn)
                InventoryPropertyLine(
                    key: "Receipt", value: provenance.hasReceipt ? "On file" : "Not on file")
                if let warranty = provenance.warranty {
                    InventoryPropertyLine(key: "Warranty", value: warranty)
                }
            }
        }
    }
}

/// Linked documents, or the reason the store cannot show them, distinct from
/// there being none: missing Paperless is a state of the store, not of the
/// item.
internal struct InventoryItemDetailDocumentsSection: View {
    internal let documents: InventoryDocuments

    @ViewBuilder internal var body: some View {
        switch documents {
        case .linked(let titles):
            InventoryItemDetailGroup("Documents") {
                ForEach(titles, id: \.self) { title in
                    Label(title, systemImage: "doc.text")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                }
            }
        case .paperlessUnavailable:
            InventoryItemDetailGroup {
                InventoryItemDetailNotice(tone: .warning, text: "Documents unavailable") {
                    InventoryItemDetailRetryButton()
                }
            }
        case .none:
            EmptyView()
        }
    }
}

/// What happened to this item, most recent first, one line each, in the ADR's
/// verbs. A line opens its account as a sheet; past the first three, the
/// last line opens the whole History page.
internal struct InventoryItemDetailHistorySection: View {
    private static var shownCount: Int { 3 }

    internal let name: String
    internal let activity: [InventoryActivityEntry]
    @State private var viewing: InventoryActivityEntry?

    @ViewBuilder internal var body: some View {
        if !activity.isEmpty {
            InventoryItemDetailGroup("History") {
                ForEach(activity.prefix(Self.shownCount)) { entry in
                    Button {
                        viewing = entry
                    } label: {
                        line(entry.title, trailing: entry.when)
                    }
                    .buttonStyle(.plain)
                }
                if activity.count > Self.shownCount {
                    NavigationLink(
                        value: InventoryItemHistoryRoute(name: name, entries: activity)
                    ) {
                        line("All history", trailing: "\(activity.count)")
                    }
                    .buttonStyle(.plain)
                }
            }
            .sheet(item: $viewing) { entry in
                InventoryHistoryEventSheet(entry: entry)
            }
        }
    }

    private func line(_ title: String, trailing: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
            Spacer(minLength: PopsSpacing.sm)
            Text(trailing)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            InventoryItemDetailDisclosure()
        }
        .contentShape(.rect)
    }
}
